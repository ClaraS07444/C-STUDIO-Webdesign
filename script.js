/* ======================================================================
   C AGENCY · SCRIPT.JS
   Funktionsübersicht
   01 Konfiguration und Utilities
   02 Dialog- und Scroll-Lock-Helfer
   03 Mobile Navigation
   04 3D-Projektkarussell
   05 Zentraler Projektfinder
   06 FAQ-Accordion
   07 Concept-Detailansicht und Rechtliches
   08 GSAP-Animationen und Funkelstern
   09 App-Initialisierung

   Architekturhinweis:
   - Jede Komponente besitzt eine eigene init-Funktion.
   - Einfache Hover-/Fokuszustände bleiben in style.css.
   - Alle Inhalte bleiben ohne GSAP sichtbar und bedienbar.
   - Der Projektfinder ist eine einzige DOM-/Formularinstanz.
   ====================================================================== */

(() => {
  "use strict";

  /* ====================================================================
     01 · KONFIGURATION UND UTILITIES
     ==================================================================== */

  // Progressive Enhancement früh kennzeichnen. Bei blockiertem JS bleibt
  // die im CSS definierte Scroll-Snap-Version des Karussells aktiv.
  document.documentElement.classList.replace("no-js", "js");

  const FORM_CONFIG = Object.freeze({
    // LAUNCH: endpoint nach Auswahl des Formularbackends eintragen.
    endpoint: "",
    // Solange true, wird nichts übertragen. Die Success-Ansicht weist
    // ausdrücklich auf den Demo-Status hin und täuscht keinen Versand vor.
    demoMode: true,
    requestTimeoutMs: 12000
  });

  const CAROUSEL_CONFIG = Object.freeze({
    cardCount: 6,
    angleStep: 60,
    dragDegreesPerPixel: 0.22,
    dragThresholdPx: 38,
    wheelThreshold: 12,
    snapDuration: 0.75
  });

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const modulo = (value, length) => ((value % length) + length) % length;
  const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  function isReducedMotion() {
    return reducedMotionQuery.matches;
  }

  function safeFocus(element) {
    if (!element || typeof element.focus !== "function") return;
    window.requestAnimationFrame(() => element.focus({ preventScroll: true }));
  }

  function supportsDialog() {
    return typeof HTMLDialogElement !== "undefined";
  }

  /* ====================================================================
     02 · DIALOG- UND SCROLL-LOCK-HELFER
     Native Dialoge übernehmen den Fokus-Trap im Modalmodus. Die Helfer
     vereinheitlichen Öffnen, Schließen, Hintergrundsperre und Fallback.
     ==================================================================== */

  function syncBodyScrollLock() {
    const lockingDialogOpen = Boolean(qs([
      ".mobile-menu[open]",
      ".project-finder-dialog[data-mode='modal'][open]",
      ".concept-dialog[open]",
      ".legal-dialog[open]"
    ].join(",")));

    document.body.classList.toggle("is-scroll-locked", lockingDialogOpen);
  }

  function showDialog(dialog, modal = true) {
    if (!dialog) return;

    if (supportsDialog()) {
      if (dialog.open) dialog.close();
      if (modal) dialog.showModal();
      else dialog.show();
    } else {
      // Sehr alter Browser: Inhalt bleibt zugänglich, auch wenn der native
      // Top-Layer und sein Fokusmanagement fehlen.
      dialog.setAttribute("open", "");
    }

    syncBodyScrollLock();
  }

  function closeDialog(dialog) {
    if (!dialog || !dialog.hasAttribute("open")) return;

    if (supportsDialog() && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");

    syncBodyScrollLock();
  }

  function closeOtherDialogs(exception) {
    qsa("dialog[open]").forEach((dialog) => {
      if (dialog !== exception) closeDialog(dialog);
    });
  }

  function closeOnBackdropClick(dialog, closeCallback = () => closeDialog(dialog)) {
    if (!dialog) return;

    dialog.addEventListener("pointerdown", (event) => {
      if (event.target === dialog && dialog.open) closeCallback();
    });
  }

  function initCurrentYear() {
    qsa("[data-current-year]").forEach((element) => {
      element.textContent = String(new Date().getFullYear());
    });
  }

  function initPlaceholderLinks() {
    qsa("[data-placeholder-link]").forEach((link) => {
      link.setAttribute("title", "Vor dem Livegang echte URL beziehungsweise E-Mail-Adresse einsetzen");
      link.addEventListener("click", (event) => event.preventDefault());
    });
  }

  /* ====================================================================
     03 · MOBILE NAVIGATION
     ==================================================================== */

  function initMobileNavigation() {
    const dialog = qs("#mobile-menu");
    const openButton = qs("[data-open-mobile-menu]");
    const closeButton = qs("[data-close-mobile-menu]", dialog);
    if (!dialog || !openButton || !closeButton) return;

    let returnFocusTo = null;

    const closeMenu = () => closeDialog(dialog);

    openButton.addEventListener("click", () => {
      returnFocusTo = openButton;
      closeOtherDialogs(dialog);
      showDialog(dialog, true);
      safeFocus(qs("a", dialog) || closeButton);
    });

    closeButton.addEventListener("click", closeMenu);
    closeOnBackdropClick(dialog, closeMenu);

    qsa("a[href^='#']", dialog).forEach((link) => {
      link.addEventListener("click", () => closeMenu());
    });

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeMenu();
    });

    dialog.addEventListener("close", () => {
      syncBodyScrollLock();
      safeFocus(returnFocusTo);
    });
  }

  /* ====================================================================
     04 · 3D-PROJEKTKARUSSELL
     Geschlossener Ring: 6 Karten × 60°. Drag, Swipe, horizontales
     Trackpad, Tastatur, Pfeile und Indikatoren führen dieselbe snapTo()-
     Funktion aus. Dadurch existiert nur eine Bewegungsquelle.
     ==================================================================== */

  function initProjectCarousel() {
    const carousel = qs("[data-carousel]");
    if (!carousel) return;

    const ring = qs("[data-carousel-ring]", carousel);
    const viewport = qs(".carousel-viewport", carousel);
    const cards = qsa("[data-carousel-card]", carousel);
    const dotsContainer = qs("[data-carousel-dots]", carousel);
    const previousButton = qs("[data-carousel-prev]", carousel);
    const nextButton = qs("[data-carousel-next]", carousel);
    const status = qs("[data-carousel-status]", carousel);

    if (!ring || !viewport || cards.length !== CAROUSEL_CONFIG.cardCount) return;

    const state = {
      activeIndex: 0,
      rotation: 0,
      pointerId: null,
      dragStartX: 0,
      dragStartRotation: 0,
      dragDistance: 0,
      isDragging: false,
      suppressClick: false,
      wheelLocked: false
    };

    const hasGSAP = Boolean(window.gsap);

    cards.forEach((card, index) => {
      card.style.transform = `rotateY(${index * CAROUSEL_CONFIG.angleStep}deg) translateZ(var(--carousel-radius))`;
      card.dataset.index = String(index);
    });

    function createDots() {
      if (!dotsContainer) return;
      const fragment = document.createDocumentFragment();

      cards.forEach((card, index) => {
        const label = qs(".carousel-card__meta b", card)?.textContent?.trim() || `Projekt ${index + 1}`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "carousel-dot";
        button.dataset.carouselDot = String(index);
        button.setAttribute("aria-label", `${label} anzeigen`);
        button.addEventListener("click", () => snapTo(index));
        fragment.appendChild(button);
      });

      dotsContainer.replaceChildren(fragment);
    }

    function setRingRotation(rotation, animate = true) {
      state.rotation = rotation;

      if (hasGSAP) {
        window.gsap.to(ring, {
          xPercent: -50,
          yPercent: -50,
          rotationY: rotation,
          duration: animate && !isReducedMotion() ? CAROUSEL_CONFIG.snapDuration : 0,
          ease: "power3.out",
          overwrite: "auto"
        });
      } else {
        ring.style.transform = `translate(-50%, -50%) rotateY(${rotation}deg)`;
      }
    }

    function setImmediateRingRotation(rotation) {
      state.rotation = rotation;
      if (hasGSAP) {
        window.gsap.set(ring, { xPercent: -50, yPercent: -50, rotationY: rotation });
      } else {
        ring.style.transform = `translate(-50%, -50%) rotateY(${rotation}deg)`;
      }
    }

    function updateAccessibleState() {
      cards.forEach((card, index) => {
        const relative = modulo(index - state.activeIndex, cards.length);
        const shortestDistance = Math.min(relative, cards.length - relative);
        const isActive = index === state.activeIndex;

        card.classList.toggle("is-active", isActive);
        card.setAttribute("aria-hidden", String(!isActive));
        card.tabIndex = isActive ? 0 : -1;
        card.style.opacity = String(shortestDistance === 0 ? 1 : shortestDistance === 1 ? 0.72 : 0.42);
        card.style.zIndex = String(10 - shortestDistance);
      });

      qsa("[data-carousel-dot]", carousel).forEach((dot, index) => {
        const isActive = index === state.activeIndex;
        dot.classList.toggle("is-active", isActive);
        dot.setAttribute("aria-current", isActive ? "true" : "false");
      });

      const activeLabel = qs(".carousel-card__meta b", cards[state.activeIndex])?.textContent?.trim();
      if (status) status.textContent = `${activeLabel || "Projekt"}, ${state.activeIndex + 1} von ${cards.length}`;
    }

    function snapTo(index, animate = true) {
      state.activeIndex = modulo(index, cards.length);
      const targetRotation = -state.activeIndex * CAROUSEL_CONFIG.angleStep;
      setRingRotation(targetRotation, animate);
      updateAccessibleState();
    }

    function step(direction) {
      snapTo(state.activeIndex + direction);
    }

    function handlePointerDown(event) {
      if (event.button !== 0 || event.target.closest("button")) return;
      state.pointerId = event.pointerId;
      state.dragStartX = event.clientX;
      state.dragStartRotation = -state.activeIndex * CAROUSEL_CONFIG.angleStep;
      state.dragDistance = 0;
      state.isDragging = true;
      state.suppressClick = false;
      viewport.setPointerCapture?.(event.pointerId);
    }

    function handlePointerMove(event) {
      if (!state.isDragging || event.pointerId !== state.pointerId) return;
      const deltaX = event.clientX - state.dragStartX;
      state.dragDistance = deltaX;
      if (Math.abs(deltaX) > 6) state.suppressClick = true;

      const rotation = state.dragStartRotation + (deltaX * CAROUSEL_CONFIG.dragDegreesPerPixel);
      setImmediateRingRotation(rotation);
    }

    function handlePointerEnd(event) {
      if (!state.isDragging || event.pointerId !== state.pointerId) return;
      state.isDragging = false;
      viewport.releasePointerCapture?.(event.pointerId);

      const distance = state.dragDistance;
      if (Math.abs(distance) >= CAROUSEL_CONFIG.dragThresholdPx) {
        step(distance < 0 ? 1 : -1);
      } else {
        snapTo(state.activeIndex);
      }

      window.setTimeout(() => {
        state.suppressClick = false;
      }, 0);
    }

    function handleWheel(event) {
      const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.15;
      if (!horizontalIntent || Math.abs(event.deltaX) < CAROUSEL_CONFIG.wheelThreshold) return;

      event.preventDefault();
      if (state.wheelLocked) return;

      state.wheelLocked = true;
      step(event.deltaX > 0 ? 1 : -1);
      window.setTimeout(() => {
        state.wheelLocked = false;
      }, 420);
    }

    function handleKeyboard(event) {
      const keyActions = {
        ArrowLeft: () => step(-1),
        ArrowRight: () => step(1),
        Home: () => snapTo(0),
        End: () => snapTo(cards.length - 1)
      };
      const action = keyActions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    }

    createDots();
    previousButton?.addEventListener("click", () => step(-1));
    nextButton?.addEventListener("click", () => step(1));
    carousel.addEventListener("keydown", handleKeyboard);
    viewport.addEventListener("pointerdown", handlePointerDown);
    viewport.addEventListener("pointermove", handlePointerMove);
    viewport.addEventListener("pointerup", handlePointerEnd);
    viewport.addEventListener("pointercancel", handlePointerEnd);
    viewport.addEventListener("wheel", handleWheel, { passive: false });

    cards.forEach((card) => {
      card.addEventListener("click", (event) => {
        const isActive = Number(card.dataset.index) === state.activeIndex;
        if (!isActive || state.suppressClick) event.preventDefault();
      });
    });

    setImmediateRingRotation(0);
    updateAccessibleState();

    // Einmaliger Interaktionshinweis statt Autoplay. Bei Reduced Motion
    // bleibt der Ring vollständig ruhig.
    if (hasGSAP && !isReducedMotion()) {
      window.gsap.timeline({ delay: 1.1 })
        .to(ring, { rotationY: 7, duration: 0.45, ease: "power2.out" })
        .to(ring, { rotationY: 0, duration: 0.65, ease: "power3.out" });
    }
  }

  /* ====================================================================
     05 · ZENTRALER PROJEKTFINDER
     Zustände: IDLE, OPEN, FILLING, VALIDATING, SUBMITTING, SUCCESS, ERROR.
     Der gleiche Dialog öffnet inline oder im Top-Layer. Eingaben werden
     bei Fehlern und beim Schließen nicht ungefragt gelöscht.
     ==================================================================== */

  function initProjectFinder() {
    const dialog = qs("[data-project-finder]");
    const form = qs("[data-project-form]", dialog);
    if (!dialog || !form) return;

    const triggers = qsa("[data-open-project-finder]");
    const closeButton = qs("[data-close-project-finder]", dialog);
    const steps = qsa("[data-form-step]", form);
    const backButton = qs("[data-form-back]", form);
    const nextButton = qs("[data-form-next]", form);
    const submitButton = qs("[data-form-submit]", form);
    const progressLabel = qs("[data-progress-label]", dialog);
    const progressBar = qs("[data-progress-bar]", dialog);
    const errorSummary = qs("[data-form-error-summary]", dialog);
    const status = qs("[data-form-status]", form);
    const successPanel = qs("[data-form-success]", dialog);
    const resetButton = qs("[data-reset-project-form]", dialog);

    const state = {
      step: 1,
      mode: "inline",
      status: "IDLE",
      returnFocusTo: null
    };

    function setState(nextState) {
      state.status = nextState;
      dialog.dataset.state = nextState;
    }

    function clearErrors() {
      qsa("[aria-invalid='true']", form).forEach((field) => field.removeAttribute("aria-invalid"));
      if (errorSummary) {
        errorSummary.textContent = "";
        errorSummary.hidden = true;
      }
      if (status) {
        status.textContent = "";
        status.className = "form-status";
      }
    }

    function showError(message, invalidField = null) {
      setState("ERROR");
      if (invalidField) invalidField.setAttribute("aria-invalid", "true");
      if (errorSummary) {
        errorSummary.textContent = message;
        errorSummary.hidden = false;
        safeFocus(errorSummary);
      }
    }

    function updateStepUI() {
      steps.forEach((stepElement, index) => {
        stepElement.hidden = index + 1 !== state.step;
      });

      if (progressLabel) progressLabel.textContent = `Schritt ${state.step} von ${steps.length}`;
      if (progressBar) progressBar.style.width = `${(state.step / steps.length) * 100}%`;

      if (backButton) backButton.hidden = state.step === 1;
      if (nextButton) nextButton.hidden = state.step === steps.length;
      if (submitButton) submitButton.hidden = state.step !== steps.length;

      setState(state.step > 1 ? "FILLING" : "OPEN");
      clearErrors();

      const currentStep = steps[state.step - 1];
      const firstControl = qs("input, textarea, button", currentStep);
      safeFocus(firstControl);
    }

    function validateCurrentStep() {
      setState("VALIDATING");
      clearErrors();
      const currentStep = steps[state.step - 1];
      if (!currentStep) return true;

      if (state.step <= 3) {
        const checkedRadio = qs("input[type='radio']:checked", currentStep);
        if (!checkedRadio) {
          showError("Bitte wähle eine Antwort aus.", qs("input[type='radio']", currentStep));
          return false;
        }
      }

      if (state.step === 4) {
        const checkedGoal = qs("input[type='checkbox']:checked", currentStep);
        if (!checkedGoal) {
          showError("Bitte wähle mindestens ein Ziel aus.", qs("input[type='checkbox']", currentStep));
          return false;
        }
      }

      if (state.step === steps.length) {
        const requiredFields = qsa("[required]", currentStep);
        const invalidField = requiredFields.find((field) => !field.checkValidity());
        if (invalidField) {
          const message = invalidField.type === "email" && invalidField.value
            ? "Bitte gib eine gültige E-Mail-Adresse ein."
            : "Bitte fülle alle gekennzeichneten Pflichtfelder aus.";
          showError(message, invalidField);
          safeFocus(invalidField);
          return false;
        }
      }

      return true;
    }

    function collectFormData() {
      const formData = new FormData(form);
      const result = {};

      for (const [key, value] of formData.entries()) {
        if (Object.prototype.hasOwnProperty.call(result, key)) {
          result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
        } else {
          result[key] = value;
        }
      }

      return result;
    }

    async function sendForm(payload) {
      if (FORM_CONFIG.demoMode || !FORM_CONFIG.endpoint) {
        await wait(isReducedMotion() ? 20 : 800);
        return { ok: true, demo: true, payload };
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), FORM_CONFIG.requestTimeoutMs);

      try {
        const response = await fetch(FORM_CONFIG.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { ok: true, demo: false };
      } finally {
        window.clearTimeout(timeout);
      }
    }

    async function handleSubmit(event) {
      event.preventDefault();
      if (state.status === "SUBMITTING" || !validateCurrentStep()) return;

      setState("SUBMITTING");
      clearErrors();
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Wird verarbeitet …";
      }
      if (status) status.textContent = "Deine Angaben werden geprüft.";

      try {
        const result = await sendForm(collectFormData());
        if (!result.ok) throw new Error("Submission failed");

        setState("SUCCESS");
        form.hidden = true;
        if (successPanel) {
          successPanel.hidden = false;
          safeFocus(successPanel);
        }
      } catch (error) {
        setState("ERROR");
        if (status) {
          status.textContent = error.name === "AbortError"
            ? "Die Anfrage hat zu lange gedauert. Bitte versuche es erneut."
            : "Die Anfrage konnte nicht gesendet werden. Deine Eingaben bleiben erhalten.";
          status.classList.add("is-error");
          safeFocus(status);
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "Anfrage prüfen & senden";
        }
      }
    }

    function resetForm() {
      form.reset();
      form.hidden = false;
      if (successPanel) successPanel.hidden = true;
      state.step = 1;
      setState("IDLE");
      updateStepUI();
    }

    function openProjectFinder(trigger, requestedMode) {
      // Wird der Projektfinder aus einem anderen Dialog geöffnet, soll der
      // Fokus nach dem Schließen nicht in den inzwischen geschlossenen
      // Dialog zurückkehren, sondern zu dessen ursprünglichem Auslöser.
      const parentDialog = trigger.closest("dialog[open]");
      state.returnFocusTo = parentDialog?._returnFocusTo || trigger;
      state.mode = requestedMode === "inline" ? "inline" : "modal";

      closeOtherDialogs(dialog);
      if (dialog.open) closeDialog(dialog);

      dialog.dataset.mode = state.mode;
      showDialog(dialog, state.mode === "modal");
      setState("OPEN");

      const heading = qs("#project-finder-title", dialog);
      safeFocus(heading || closeButton);

      if (state.mode === "inline") {
        dialog.scrollIntoView({
          behavior: isReducedMotion() ? "auto" : "smooth",
          block: "nearest"
        });
      }
    }

    function closeProjectFinder() {
      closeDialog(dialog);
    }

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const requestedMode = trigger.dataset.projectFinderMode || "modal";
        // Einen eventuell geöffneten Concept-Dialog zuerst schließen, bevor
        // der Projektfinder in den nativen Top-Layer wechselt.
        window.requestAnimationFrame(() => openProjectFinder(trigger, requestedMode));
      });
    });

    closeButton?.addEventListener("click", closeProjectFinder);
    closeOnBackdropClick(dialog, () => {
      if (dialog.dataset.mode === "modal") closeProjectFinder();
    });

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeProjectFinder();
    });

    dialog.addEventListener("close", () => {
      syncBodyScrollLock();
      setState("IDLE");
      safeFocus(state.returnFocusTo);
    });

    nextButton?.addEventListener("click", () => {
      if (!validateCurrentStep()) return;
      state.step = Math.min(steps.length, state.step + 1);
      updateStepUI();
    });

    backButton?.addEventListener("click", () => {
      state.step = Math.max(1, state.step - 1);
      updateStepUI();
    });

    form.addEventListener("submit", handleSubmit);
    resetButton?.addEventListener("click", resetForm);

    updateStepUI();
  }

  /* ====================================================================
     06 · FAQ-ACCORDION
     Mehrere Einträge können offen sein. hidden wird erst nach der
     Schließanimation gesetzt, damit der Bereich für Screenreader und
     Tastaturzustand korrekt bleibt.
     ==================================================================== */

  function initFAQ() {
    const items = qsa(".faq-item");
    if (!items.length) return;

    const hasGSAP = Boolean(window.gsap);

    function openAnswer(button, answer) {
      button.setAttribute("aria-expanded", "true");
      answer.hidden = false;

      if (!hasGSAP || isReducedMotion()) {
        answer.style.height = "auto";
        return;
      }

      window.gsap.fromTo(answer,
        { height: 0 },
        {
          height: "auto",
          duration: 0.42,
          ease: "power2.out",
          clearProps: "height",
          overwrite: true
        }
      );
    }

    function closeAnswer(button, answer) {
      button.setAttribute("aria-expanded", "false");

      if (!hasGSAP || isReducedMotion()) {
        answer.hidden = true;
        answer.style.height = "";
        return;
      }

      window.gsap.to(answer, {
        height: 0,
        duration: 0.32,
        ease: "power2.inOut",
        overwrite: true,
        onComplete: () => {
          answer.hidden = true;
          answer.style.height = "";
        }
      });
    }

    items.forEach((item) => {
      const button = qs("h3 > button", item);
      const answer = qs(".faq-answer", item);
      if (!button || !answer) return;

      button.addEventListener("click", () => {
        const isOpen = button.getAttribute("aria-expanded") === "true";
        if (isOpen) closeAnswer(button, answer);
        else openAnswer(button, answer);
      });
    });
  }

  /* ====================================================================
     07 · CONCEPT-DETAILANSICHT UND RECHTLICHES
     Concrete Concept-Inhalte sind laut PRD offen. Die Datenstruktur zeigt
     die späteren Austauschpunkte ohne erfundene Kundenprojekte.
     ==================================================================== */

  function initConceptDialog() {
    const dialog = qs("[data-concept-dialog]");
    if (!dialog) return;

    const conceptData = [
      {
        number: "01 / Concept",
        title: "Projektname folgt",
        category: "Projektkategorie folgt",
        cover: "Concept Cover 01",
        description: "Hier entsteht die Beschreibung des ersten freien Designkonzepts – mit Designrichtung, Branche und gewünschter Wirkung."
      },
      {
        number: "02 / Concept",
        title: "Projektname folgt",
        category: "Projektkategorie folgt",
        cover: "Concept Cover 02",
        description: "Dieser flexible Slot ist für ein eigenständiges Konzept mit individuellem Bildformat, Layout und Interaktionsidee vorbereitet."
      },
      {
        number: "03 / Concept",
        title: "Projektname folgt",
        category: "Projektkategorie folgt",
        cover: "Concept Cover 03",
        description: "Der dritte Slot kann später um Desktop-, Mobile-, Designsystem-, UI-Detail- und Interaction-Module erweitert werden."
      }
    ];

    const closeButton = qs("[data-close-concept]", dialog);

    function populateConcept(index) {
      const data = conceptData[index] || conceptData[0];
      const bindings = {
        "[data-concept-number]": data.number,
        "[data-concept-title]": data.title,
        "[data-concept-category]": data.category,
        "[data-concept-cover]": data.cover,
        "[data-concept-description]": data.description
      };

      Object.entries(bindings).forEach(([selector, value]) => {
        const element = qs(selector, dialog);
        if (element) element.textContent = value;
      });
    }

    qsa("[data-open-concept]").forEach((trigger) => {
      trigger.addEventListener("click", () => {
        dialog._returnFocusTo = trigger;
        populateConcept(Number(trigger.dataset.concept || 0));
        closeOtherDialogs(dialog);
        showDialog(dialog, true);
        safeFocus(qs("#concept-dialog-title", dialog) || closeButton);
      });
    });

    closeButton?.addEventListener("click", () => closeDialog(dialog));
    closeOnBackdropClick(dialog);

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDialog(dialog);
    });

    dialog.addEventListener("close", () => {
      syncBodyScrollLock();
      safeFocus(dialog._returnFocusTo);
    });
  }

  function initLegalDialogs() {
    qsa("[data-open-legal]").forEach((trigger) => {
      const dialog = qs(`#${trigger.dataset.openLegal}`);
      if (!dialog) return;

      trigger.addEventListener("click", () => {
        dialog._returnFocusTo = trigger;
        closeOtherDialogs(dialog);
        showDialog(dialog, true);
        safeFocus(qs("h2", dialog) || qs("[data-close-dialog]", dialog));
      });
    });

    qsa(".legal-dialog").forEach((dialog) => {
      const closeButton = qs("[data-close-dialog]", dialog);
      closeButton?.addEventListener("click", () => closeDialog(dialog));
      closeOnBackdropClick(dialog);

      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeDialog(dialog);
      });

      dialog.addEventListener("close", () => {
        syncBodyScrollLock();
        safeFocus(dialog._returnFocusTo);
      });
    });
  }

  /* ====================================================================
     08 · GSAP-ANIMATIONEN UND FUNKELSTERN
     GSAP wird nur verwendet, wenn CDN und Plugin geladen sind. Ohne GSAP
     existiert kein versteckter Ausgangszustand; Inhalte bleiben sichtbar.
     ==================================================================== */

  function initSparkStar() {
    const star = qs("[data-spark-star]");
    if (!star || !window.gsap || isReducedMotion()) return;

    const sparkles = qsa("i", star);
    let isAnimating = false;

    function sparkle() {
      if (isAnimating) return;
      isAnimating = true;

      window.gsap.timeline({
        onComplete: () => {
          isAnimating = false;
        }
      })
        .to(star, { scale: 1.05, filter: "brightness(1.18) drop-shadow(0 1.3rem 1.7rem rgba(17,17,17,.2))", duration: 0.25, ease: "power2.out" })
        .to(sparkles, { autoAlpha: 1, scale: 1.6, stagger: 0.06, duration: 0.16 }, "<")
        .to(sparkles, { autoAlpha: 0, scale: 0.5, stagger: 0.05, duration: 0.24 })
        .to(star, { scale: 1, filter: "brightness(1) drop-shadow(0 1.2rem 1.4rem rgba(17,17,17,.18))", duration: 0.35, ease: "power2.inOut" }, "<");
    }

    star.addEventListener("pointerenter", sparkle);
    star.addEventListener("focusin", sparkle);
    star._sparkle = sparkle;
  }

  function initScrollAnimations() {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    if (!gsap || !ScrollTrigger || isReducedMotion()) return;

    gsap.registerPlugin(ScrollTrigger);

    // Ruhiger Standard-Reveal für normale Inhalte.
    qsa("[data-reveal]").forEach((element) => {
      const direction = element.dataset.reveal || "bottom";
      const offsets = {
        left: { x: -70, y: 0 },
        right: { x: 70, y: 0 },
        bottom: { x: 0, y: 34 }
      };
      const offset = offsets[direction] || offsets.bottom;

      gsap.from(element, {
        autoAlpha: 0,
        x: offset.x,
        y: offset.y,
        duration: 0.9,
        ease: "power3.out",
        clearProps: "transform,opacity,visibility",
        scrollTrigger: {
          trigger: element,
          start: "top 88%",
          once: true
        }
      });
    });

    // PRD-spezifische Bewegungsrichtungen in Abschnitt 8.
    qsa("[data-special-reveal]").forEach((element) => {
      const direction = element.dataset.specialReveal;
      const offsets = {
        left: { x: -100, y: 0 },
        right: { x: 100, y: 0 },
        bottom: { x: 0, y: 100 }
      };
      const offset = offsets[direction] || offsets.bottom;

      gsap.from(element, {
        autoAlpha: 0,
        x: offset.x,
        y: offset.y,
        duration: 1,
        ease: "power3.out",
        clearProps: "transform,opacity,visibility",
        scrollTrigger: {
          trigger: element,
          start: "top 85%",
          once: true
        }
      });
    });

    const heroCopy = qs("[data-hero-copy]");
    const carousel = qs("[data-carousel]");
    if (heroCopy && carousel) {
      gsap.timeline({ defaults: { ease: "power3.out" } })
        .from(qsa(":scope > *", heroCopy), { autoAlpha: 0, y: 28, duration: 0.8, stagger: 0.08 })
        .from(carousel, { autoAlpha: 0, x: 44, rotationY: -4, duration: 1.05 }, "<0.16");
    }

    const star = qs("[data-spark-star]");
    if (star?._sparkle) {
      ScrollTrigger.create({
        trigger: star,
        start: "top 82%",
        once: true,
        onEnter: () => star._sparkle()
      });
    }
  }

  function initReducedMotionListener() {
    const handleChange = () => {
      if (reducedMotionQuery.matches && window.ScrollTrigger) {
        window.ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
        qsa("[data-reveal], [data-special-reveal]").forEach((element) => {
          element.style.removeProperty("opacity");
          element.style.removeProperty("visibility");
          element.style.removeProperty("transform");
        });
      }
    };

    if (typeof reducedMotionQuery.addEventListener === "function") {
      reducedMotionQuery.addEventListener("change", handleChange);
    } else {
      reducedMotionQuery.addListener(handleChange);
    }
  }

  /* ====================================================================
     09 · APP-INITIALISIERUNG
     Reihenfolge: Funktionale Komponenten zuerst, Animationen zuletzt.
     So bleibt die Website auch bei Animationsfehlern vollständig nutzbar.
     ==================================================================== */

  function initApp() {
    initCurrentYear();
    initPlaceholderLinks();
    initMobileNavigation();
    initProjectCarousel();
    initProjectFinder();
    initFAQ();
    initConceptDialog();
    initLegalDialogs();
    initSparkStar();
    initScrollAnimations();
    initReducedMotionListener();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp, { once: true });
  } else {
    initApp();
  }
})();
