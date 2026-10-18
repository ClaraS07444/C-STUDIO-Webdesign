/* ======================================================================
   C AGENCY · SCRIPT.JS
   01 Konfiguration / Utilities
   02 Dialog-Helfer / Mobile Navigation
   03 6-teiliges 3D-Karussell
   04 Angebotsfragen im schwarzen Inline-Kasten
   05 Horizontale Referenz- und Concept-Scroller
   06 FAQ / Concept- und Rechtstext-Dialoge
   07 GSAP / Reduced Motion
   08 App-Initialisierung

   Architektur:
   - Vanilla JavaScript übernimmt sämtliche Kernfunktionen.
   - GSAP/ScrollTrigger werden ausschließlich für kontrollierte komplexere
     Bewegungen verwendet. Fällt das CDN aus, bleibt alles nutzbar.
   - Die Angebotsfragen existieren genau einmal und bleiben im selben Kasten.
   ====================================================================== */

(() => {
  "use strict";

  document.documentElement.classList.replace("no-js", "js");

  /* ====================================================================
     01 · KONFIGURATION UND UTILITIES
     LAUNCH: Erst nach Auswahl eines Backends beide leeren Werte ersetzen.
     demoMode muss erst dann auf false gesetzt werden. Ohne Konfiguration
     validiert die Website vollständig, behauptet aber keinen Versand.
     ==================================================================== */
  const FORM_CONFIG = Object.freeze({
    endpoint: "", // REPLACE: z. B. sicherer eigener Formular-Endpoint
    recipientEmail: "", // REPLACE: finale geschäftliche Empfängeradresse
    demoMode: true,
    requestTimeoutMs: 12000
  });

  const CAROUSEL_CONFIG = Object.freeze({
    cardCount: 6,
    angleStep: 60,
    dragDegreesPerPixel: 0.22,
    dragThresholdPx: 34,
    wheelThreshold: 12,
    snapDuration: 0.72
  });

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const modulo = (value, length) => ((value % length) + length) % length;
  const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  const isReducedMotion = () => reducedMotionQuery.matches;

  function safeFocus(element) {
    if (!element || typeof element.focus !== "function") return;
    window.requestAnimationFrame(() => element.focus({ preventScroll: true }));
  }

  function supportsDialog() {
    return typeof HTMLDialogElement !== "undefined";
  }

  function smoothScrollTo(element, block = "center") {
    element?.scrollIntoView({ behavior: isReducedMotion() ? "auto" : "smooth", block });
  }

  /* ====================================================================
     02 · DIALOG-HELFER UND MOBILE NAVIGATION
     ==================================================================== */
  function syncBodyScrollLock() {
    const modalOpen = Boolean(qs(".mobile-menu[open], .concept-dialog[open], .legal-dialog[open]"));
    document.body.classList.toggle("is-scroll-locked", modalOpen);
  }

  function showDialog(dialog) {
    if (!dialog) return;
    if (supportsDialog()) {
      if (dialog.open) dialog.close();
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    syncBodyScrollLock();
  }

  function closeDialog(dialog) {
    if (!dialog?.hasAttribute("open")) return;
    if (supportsDialog() && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    syncBodyScrollLock();
  }

  function closeOtherDialogs(exception = null) {
    qsa("dialog[open]").forEach((dialog) => {
      if (dialog !== exception) closeDialog(dialog);
    });
  }

  function closeOnBackdropClick(dialog, callback = () => closeDialog(dialog)) {
    dialog?.addEventListener("pointerdown", (event) => {
      if (event.target === dialog && dialog.open) callback();
    });
  }

  function initCurrentYear() {
    qsa("[data-current-year]").forEach((element) => {
      element.textContent = String(new Date().getFullYear());
    });
  }

  function initPlaceholderLinks() {
    qsa("[data-placeholder-link]").forEach((link) => {
      link.title = "Vor dem Livegang echte Projekt-URL einsetzen";
      link.addEventListener("click", (event) => event.preventDefault());
    });
  }

  function initMobileNavigation() {
    const dialog = qs("#mobile-menu");
    const openButton = qs("[data-open-mobile-menu]");
    const closeButton = qs("[data-close-mobile-menu]", dialog);
    if (!dialog || !openButton || !closeButton) return;

    let returnFocusTo = openButton;
    const closeMenu = () => closeDialog(dialog);

    openButton.addEventListener("click", () => {
      returnFocusTo = openButton;
      closeOtherDialogs(dialog);
      showDialog(dialog);
      safeFocus(qs("a", dialog) || closeButton);
    });
    closeButton.addEventListener("click", closeMenu);
    closeOnBackdropClick(dialog, closeMenu);
    qsa("a[href^='#']", dialog).forEach((link) => link.addEventListener("click", closeMenu));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeMenu(); });
    dialog.addEventListener("close", () => { syncBodyScrollLock(); safeFocus(returnFocusTo); });
  }

  /* ====================================================================
     03 · 6-TEILIGES 3D-KARUSSELL
     Sechs Karten × 60° bilden einen geschlossenen Ring. Front- und Rückseite
     jeder Karte zeigen dieselbe reine Bildfläche; Text-Metadaten existieren
     nur als Accessible Name am Link und nicht sichtbar auf der Karte.
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
      const fragment = document.createDocumentFragment();
      cards.forEach((card, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "carousel-dot";
        button.dataset.carouselDot = String(index);
        button.setAttribute("aria-label", `Websitebild ${index + 1} anzeigen`);
        button.addEventListener("click", () => snapTo(index));
        fragment.appendChild(button);
      });
      dotsContainer?.replaceChildren(fragment);
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

    function setImmediateRotation(rotation) {
      state.rotation = rotation;
      if (hasGSAP) window.gsap.set(ring, { xPercent: -50, yPercent: -50, rotationY: rotation });
      else ring.style.transform = `translate(-50%, -50%) rotateY(${rotation}deg)`;
    }

    function updateState() {
      cards.forEach((card, index) => {
        const relative = modulo(index - state.activeIndex, cards.length);
        const distance = Math.min(relative, cards.length - relative);
        const isActive = index === state.activeIndex;
        card.classList.toggle("is-active", isActive);
        card.setAttribute("aria-hidden", String(!isActive));
        card.tabIndex = isActive ? 0 : -1;
        card.style.opacity = String(distance === 0 ? 1 : distance === 1 ? 0.76 : 0.38);
        card.style.zIndex = String(10 - distance);
      });

      qsa("[data-carousel-dot]", carousel).forEach((dot, index) => {
        const isActive = index === state.activeIndex;
        dot.classList.toggle("is-active", isActive);
        dot.setAttribute("aria-current", isActive ? "true" : "false");
      });
      if (status) status.textContent = `Websitebild ${state.activeIndex + 1} von ${cards.length}`;
    }

    function snapTo(index, animate = true) {
      state.activeIndex = modulo(index, cards.length);
      setRingRotation(-state.activeIndex * CAROUSEL_CONFIG.angleStep, animate);
      updateState();
    }

    const step = (direction) => snapTo(state.activeIndex + direction);

    function onPointerDown(event) {
      if (event.button !== 0 || event.target.closest("button")) return;
      state.pointerId = event.pointerId;
      state.dragStartX = event.clientX;
      state.dragStartRotation = -state.activeIndex * CAROUSEL_CONFIG.angleStep;
      state.dragDistance = 0;
      state.isDragging = true;
      state.suppressClick = false;
      viewport.setPointerCapture?.(event.pointerId);
    }

    function onPointerMove(event) {
      if (!state.isDragging || event.pointerId !== state.pointerId) return;
      const deltaX = event.clientX - state.dragStartX;
      state.dragDistance = deltaX;
      if (Math.abs(deltaX) > 6) state.suppressClick = true;
      setImmediateRotation(state.dragStartRotation + deltaX * CAROUSEL_CONFIG.dragDegreesPerPixel);
    }

    function onPointerEnd(event) {
      if (!state.isDragging || event.pointerId !== state.pointerId) return;
      state.isDragging = false;
      viewport.releasePointerCapture?.(event.pointerId);
      if (Math.abs(state.dragDistance) >= CAROUSEL_CONFIG.dragThresholdPx) step(state.dragDistance < 0 ? 1 : -1);
      else snapTo(state.activeIndex);
      window.setTimeout(() => { state.suppressClick = false; }, 0);
    }

    function onWheel(event) {
      const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.15;
      if (!horizontalIntent || Math.abs(event.deltaX) < CAROUSEL_CONFIG.wheelThreshold) return;
      event.preventDefault();
      if (state.wheelLocked) return;
      state.wheelLocked = true;
      step(event.deltaX > 0 ? 1 : -1);
      window.setTimeout(() => { state.wheelLocked = false; }, 380);
    }

    function onKeydown(event) {
      const actions = {
        ArrowLeft: () => step(-1),
        ArrowRight: () => step(1),
        Home: () => snapTo(0),
        End: () => snapTo(cards.length - 1)
      };
      if (!actions[event.key]) return;
      event.preventDefault();
      actions[event.key]();
    }

    createDots();
    previousButton?.addEventListener("click", () => step(-1));
    nextButton?.addEventListener("click", () => step(1));
    carousel.addEventListener("keydown", onKeydown);
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerEnd);
    viewport.addEventListener("pointercancel", onPointerEnd);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    cards.forEach((card) => card.addEventListener("click", (event) => {
      if (Number(card.dataset.index) !== state.activeIndex || state.suppressClick) event.preventDefault();
    }));

    setImmediateRotation(0);
    updateState();

    if (hasGSAP && !isReducedMotion()) {
      window.gsap.timeline({ delay: 1 })
        .to(ring, { rotationY: 7, duration: .4, ease: "power2.out" })
        .to(ring, { rotationY: 0, duration: .62, ease: "power3.out" });
    }
  }

  /* ====================================================================
     04 · ANGEBOTSFRAGEN IM SELBEN KASTEN
     Zustände: CLOSED, OPEN, FILLING, VALIDATING, SUBMITTING, SUCCESS, ERROR.
     ==================================================================== */
  function initOfferWizard() {
    const box = qs("[data-offer-box]");
    const startButton = qs(".offer-box__start", box);
    const wizard = qs("#offer-wizard", box);
    const closeButton = qs("[data-close-offer]", box);
    const form = qs("[data-offer-form]", box);
    if (!box || !startButton || !wizard || !form) return;

    const externalTriggers = qsa("[data-open-offer]").filter((trigger) => trigger !== startButton);
    const steps = qsa("[data-offer-step]", form);
    const backButton = qs("[data-offer-back]", form);
    const nextButton = qs("[data-offer-next]", form);
    const submitButton = qs("[data-offer-submit]", form);
    const progressLabel = qs("[data-offer-progress]", box);
    const progressBar = qs("[data-offer-progress-bar]", box);
    const errorBox = qs("[data-offer-error]", box);
    const status = qs("[data-offer-status]", box);
    const successPanel = qs("[data-offer-success]", box);
    const resetButton = qs("[data-reset-offer]", box);
    const state = { step: 1, status: "CLOSED", returnFocusTo: startButton };

    function setState(value) {
      state.status = value;
      box.dataset.state = value.toLowerCase();
    }

    function clearErrors() {
      qsa("[aria-invalid='true']", form).forEach((field) => field.removeAttribute("aria-invalid"));
      if (errorBox) { errorBox.hidden = true; errorBox.textContent = ""; }
      if (status) status.textContent = "";
    }

    function showError(message, field = null) {
      setState("ERROR");
      if (field) field.setAttribute("aria-invalid", "true");
      if (errorBox) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        safeFocus(errorBox);
      }
    }

    function animateCurrentStep() {
      const current = steps[state.step - 1];
      if (!current || !window.gsap || isReducedMotion()) return;
      window.gsap.fromTo(current, { autoAlpha: 0, x: 20 }, { autoAlpha: 1, x: 0, duration: .38, ease: "power2.out", clearProps: "transform,opacity,visibility" });
    }

    function updateStep() {
      steps.forEach((step, index) => { step.hidden = index + 1 !== state.step; });
      if (progressLabel) progressLabel.textContent = `${String(state.step).padStart(2, "0")} / ${String(steps.length).padStart(2, "0")}`;
      if (progressBar) progressBar.style.width = `${state.step / steps.length * 100}%`;
      if (backButton) backButton.hidden = state.step === 1;
      if (nextButton) nextButton.hidden = state.step === steps.length;
      if (submitButton) submitButton.hidden = state.step !== steps.length;
      setState(state.step === 1 ? "OPEN" : "FILLING");
      clearErrors();
      animateCurrentStep();
      safeFocus(qs("input, textarea", steps[state.step - 1]));
    }

    function validateStep() {
      setState("VALIDATING");
      clearErrors();
      const current = steps[state.step - 1];

      if (state.step <= 3) {
        const first = qs("input[type='radio']", current);
        if (!qs("input[type='radio']:checked", current)) {
          showError("Bitte wähle eine Antwort aus.", first);
          return false;
        }
      }
      if (state.step === 4 && !qs("input[type='checkbox']:checked", current)) {
        showError("Bitte wähle mindestens ein Ziel aus.", qs("input[type='checkbox']", current));
        return false;
      }
      if (state.step === steps.length) {
        const invalid = qsa("[required]", current).find((field) => !field.checkValidity());
        if (invalid) {
          const message = invalid.type === "email" && invalid.value ? "Bitte gib eine gültige E-Mail-Adresse ein." : "Bitte fülle alle Pflichtfelder aus.";
          showError(message, invalid);
          safeFocus(invalid);
          return false;
        }
      }
      return true;
    }

    function collectPayload() {
      const result = { recipientEmail: FORM_CONFIG.recipientEmail, submittedAt: new Date().toISOString() };
      for (const [key, value] of new FormData(form).entries()) {
        if (Object.prototype.hasOwnProperty.call(result, key)) result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
        else result[key] = value;
      }
      return result;
    }

    async function sendPayload(payload) {
      if (FORM_CONFIG.demoMode || !FORM_CONFIG.endpoint || !FORM_CONFIG.recipientEmail) {
        await wait(isReducedMotion() ? 20 : 650);
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

    function openWizard(trigger = startButton) {
      state.returnFocusTo = trigger;
      const parentDialog = trigger.closest("dialog[open]");
      if (parentDialog) {
        state.returnFocusTo = parentDialog._returnFocusTo || qs(`[data-open-concept][data-concept='${parentDialog.dataset.conceptIndex || "0"}']`) || trigger;
        closeDialog(parentDialog);
      }
      startButton.hidden = true;
      startButton.setAttribute("aria-expanded", "true");
      wizard.hidden = false;
      if (successPanel?.hidden === false) safeFocus(successPanel);
      else updateStep();
      smoothScrollTo(box, "center");
    }

    function closeWizard() {
      wizard.hidden = true;
      startButton.hidden = false;
      startButton.setAttribute("aria-expanded", "false");
      setState("CLOSED");
      safeFocus(state.returnFocusTo?.isConnected ? state.returnFocusTo : startButton);
    }

    function resetWizard() {
      form.reset();
      form.hidden = false;
      if (successPanel) successPanel.hidden = true;
      state.step = 1;
      updateStep();
    }

    startButton.addEventListener("click", () => openWizard(startButton));
    externalTriggers.forEach((trigger) => trigger.addEventListener("click", () => openWizard(trigger)));
    closeButton?.addEventListener("click", closeWizard);
    nextButton?.addEventListener("click", () => {
      if (!validateStep()) return;
      state.step = Math.min(steps.length, state.step + 1);
      updateStep();
    });
    backButton?.addEventListener("click", () => {
      state.step = Math.max(1, state.step - 1);
      updateStep();
    });
    resetButton?.addEventListener("click", resetWizard);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (state.status === "SUBMITTING" || !validateStep()) return;
      setState("SUBMITTING");
      clearErrors();
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = "Wird vorbereitet …"; }
      if (status) status.textContent = "Angaben werden geprüft.";
      try {
        const result = await sendPayload(collectPayload());
        if (!result.ok) throw new Error("Submission failed");
        setState("SUCCESS");
        form.hidden = true;
        if (successPanel) { successPanel.hidden = false; safeFocus(successPanel); }
      } catch (error) {
        setState("ERROR");
        if (status) {
          status.textContent = error.name === "AbortError" ? "Die Anfrage hat zu lange gedauert. Bitte versuche es erneut." : "Die Anfrage konnte nicht verarbeitet werden. Deine Eingaben bleiben erhalten.";
          safeFocus(status);
        }
      } finally {
        if (submitButton) { submitButton.disabled = false; submitButton.textContent = "Anfrage vorbereiten →"; }
      }
    });
  }

  /* ====================================================================
     05 · HORIZONTALE SCROLLER
     Native Touch-Navigation plus Maus-Drag, Trackpad, Pfeiltasten sowie
     Vor-/Zurück-Buttons. Kein globaler Seiten-Overflow wird erzeugt.
     ==================================================================== */
  function initHorizontalScrollers() {
    qsa("[data-horizontal-scroller]").forEach((scroller) => {
      const section = scroller.closest("section");
      const previousButton = qs("[data-scroll-prev]", section);
      const nextButton = qs("[data-scroll-next]", section);
      let pointerId = null;
      let startX = 0;
      let startScrollLeft = 0;
      let moved = false;

      const amount = () => Math.max(260, scroller.clientWidth * .72);
      const scrollByAmount = (direction) => scroller.scrollBy({ left: direction * amount(), behavior: isReducedMotion() ? "auto" : "smooth" });

      previousButton?.addEventListener("click", () => scrollByAmount(-1));
      nextButton?.addEventListener("click", () => scrollByAmount(1));

      scroller.addEventListener("keydown", (event) => {
        const actions = {
          ArrowLeft: () => scrollByAmount(-1),
          ArrowRight: () => scrollByAmount(1),
          PageUp: () => scrollByAmount(-1),
          PageDown: () => scrollByAmount(1),
          Home: () => scroller.scrollTo({ left: 0, behavior: isReducedMotion() ? "auto" : "smooth" }),
          End: () => scroller.scrollTo({ left: scroller.scrollWidth, behavior: isReducedMotion() ? "auto" : "smooth" })
        };
        if (!actions[event.key]) return;
        event.preventDefault();
        actions[event.key]();
      });

      scroller.addEventListener("wheel", (event) => {
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        if (!event.shiftKey || Math.abs(event.deltaY) < 4) return;
        event.preventDefault();
        scroller.scrollLeft += event.deltaY;
      }, { passive: false });

      scroller.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch" || event.button !== 0) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startScrollLeft = scroller.scrollLeft;
        moved = false;
        scroller.classList.add("is-dragging");
      });
      scroller.addEventListener("pointermove", (event) => {
        if (event.pointerId !== pointerId) return;
        const delta = event.clientX - startX;
        if (Math.abs(delta) > 5 && !moved) {
          moved = true;
          // Pointer Capture erst nach eindeutigem Drag aktivieren. Würde es
          // bereits beim Pointerdown gesetzt, könnte ein normaler Klick auf
          // Concept-Buttons zum Scroller umgeleitet werden.
          scroller.setPointerCapture?.(pointerId);
        }
        scroller.scrollLeft = startScrollLeft - delta;
      });
      const endDrag = (event) => {
        if (event.pointerId !== pointerId) return;
        if (scroller.hasPointerCapture?.(pointerId)) scroller.releasePointerCapture(pointerId);
        scroller.classList.remove("is-dragging");
        pointerId = null;
        window.setTimeout(() => { moved = false; }, 0);
      };
      scroller.addEventListener("pointerup", endDrag);
      scroller.addEventListener("pointercancel", endDrag);
      scroller.addEventListener("click", (event) => {
        if (moved) { event.preventDefault(); event.stopPropagation(); }
      }, true);
    });
  }

  /* ====================================================================
     06 · FAQ, CONCEPT- UND RECHTSTEXT-DIALOGE
     ==================================================================== */
  function initFAQ() {
    const hasGSAP = Boolean(window.gsap);
    qsa(".faq-list article").forEach((item) => {
      const button = qs("h3 > button", item);
      const answer = qs(".faq-answer", item);
      if (!button || !answer) return;

      button.addEventListener("click", () => {
        const open = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!open));

        if (open) {
          if (!hasGSAP || isReducedMotion()) { answer.hidden = true; answer.style.height = ""; }
          else window.gsap.to(answer, { height: 0, duration: .28, ease: "power2.inOut", onComplete: () => { answer.hidden = true; answer.style.height = ""; } });
        } else {
          answer.hidden = false;
          if (!hasGSAP || isReducedMotion()) answer.style.height = "auto";
          else window.gsap.fromTo(answer, { height: 0 }, { height: "auto", duration: .38, ease: "power2.out", clearProps: "height" });
        }
      });
    });
  }

  function initConceptDialog() {
    const dialog = qs("[data-concept-dialog]");
    if (!dialog) return;
    const closeButton = qs("[data-close-concept]", dialog);
    const data = [
      { number: "01 / Concept", title: "Concept 01", category: "Projektkategorie folgt", description: "Hier entsteht die Case Study mit Desktop-, Mobile-, Designsystem- und UI-Detailansichten." },
      { number: "02 / Concept", title: "Concept 02", category: "Projektkategorie folgt", description: "Ein flexibler Slot für eine eigenständige Designrichtung und eine spätere ausführliche Case Study." },
      { number: "03 / Concept", title: "Concept 03", category: "Projektkategorie folgt", description: "Dieser Slot ist für Desktop-, Mobile-, UI-Detail- und Interaction-Module vorbereitet." },
      { number: "04 / Concept", title: "Concept 04", category: "Projektkategorie folgt", description: "Ein weiterer erweiterbarer Concept-Slot mit klarer Kennzeichnung als freie Designarbeit." }
    ];

    function populate(index) {
      const item = data[index] || data[0];
      dialog.dataset.conceptIndex = String(index);
      const values = { "[data-concept-number]": item.number, "[data-concept-title]": item.title, "[data-concept-category]": item.category, "[data-concept-description]": item.description };
      Object.entries(values).forEach(([selector, value]) => { const element = qs(selector, dialog); if (element) element.textContent = value; });
    }

    qsa("[data-open-concept]").forEach((trigger) => trigger.addEventListener("click", () => {
      const index = Number(trigger.dataset.concept || 0);
      dialog._returnFocusTo = trigger;
      populate(index);
      closeOtherDialogs(dialog);
      showDialog(dialog);
      safeFocus(qs("#concept-dialog-title", dialog) || closeButton);
    }));
    closeButton?.addEventListener("click", () => closeDialog(dialog));
    closeOnBackdropClick(dialog);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener("close", () => { syncBodyScrollLock(); safeFocus(dialog._returnFocusTo); });
  }

  function initLegalDialogs() {
    qsa("[data-open-legal]").forEach((trigger) => {
      const dialog = qs(`#${trigger.dataset.openLegal}`);
      if (!dialog) return;
      trigger.addEventListener("click", () => {
        dialog._returnFocusTo = trigger;
        closeOtherDialogs(dialog);
        showDialog(dialog);
        safeFocus(qs("h2", dialog) || qs("[data-close-dialog]", dialog));
      });
    });

    qsa(".legal-dialog").forEach((dialog) => {
      qs("[data-close-dialog]", dialog)?.addEventListener("click", () => closeDialog(dialog));
      closeOnBackdropClick(dialog);
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDialog(dialog); });
      dialog.addEventListener("close", () => { syncBodyScrollLock(); safeFocus(dialog._returnFocusTo); });
    });
  }

  /* ====================================================================
     07 · GSAP, FUNKELSTERN UND REDUCED MOTION
     ==================================================================== */
  function initSparkStar() {
    const star = qs("[data-spark-star]");
    if (!star || !window.gsap || isReducedMotion()) return;
    const sparkles = qsa("i", star);
    let running = false;
    const sparkle = () => {
      if (running) return;
      running = true;
      window.gsap.timeline({ onComplete: () => { running = false; } })
        .to(star, { scale: 1.05, filter: "brightness(1.15) drop-shadow(0 1.3rem 1.2rem rgba(11,11,11,.2))", duration: .22 })
        .to(sparkles, { autoAlpha: 1, scale: 1.6, stagger: .05, duration: .15 }, "<")
        .to(sparkles, { autoAlpha: 0, scale: .5, stagger: .04, duration: .22 })
        .to(star, { scale: 1, filter: "brightness(1) drop-shadow(0 1.2rem 1rem rgba(11,11,11,.18))", duration: .3 }, "<");
    };
    star.addEventListener("pointerenter", sparkle);
    star._sparkle = sparkle;
  }

  function initScrollAnimations() {
    if (!window.gsap || !window.ScrollTrigger || isReducedMotion()) return;
    window.gsap.registerPlugin(window.ScrollTrigger);

    qsa("[data-reveal]").forEach((element) => {
      window.gsap.from(element, { autoAlpha: 0, y: 30, duration: .85, ease: "power3.out", clearProps: "transform,opacity,visibility", scrollTrigger: { trigger: element, start: "top 88%", once: true } });
    });
    qsa("[data-special-reveal]").forEach((element) => {
      const direction = element.dataset.specialReveal;
      const offset = direction === "left" ? { x: -80, y: 0 } : direction === "right" ? { x: 80, y: 0 } : { x: 0, y: 70 };
      window.gsap.from(element, { autoAlpha: 0, ...offset, duration: .9, ease: "power3.out", clearProps: "transform,opacity,visibility", scrollTrigger: { trigger: element, start: "top 86%", once: true } });
    });

    const heroCopy = qs("[data-hero-copy]");
    const carousel = qs("[data-carousel]");
    if (heroCopy && carousel) {
      window.gsap.timeline({ defaults: { ease: "power3.out" } })
        .from(qsa(":scope > *", heroCopy), { autoAlpha: 0, y: 24, duration: .75, stagger: .08 })
        .from(carousel, { autoAlpha: 0, x: 45, rotationY: -4, duration: 1 }, "<.12");
    }

    const star = qs("[data-spark-star]");
    if (star?._sparkle) window.ScrollTrigger.create({ trigger: star, start: "top 82%", once: true, onEnter: () => star._sparkle() });
  }

  function initReducedMotionListener() {
    const handleChange = () => {
      if (!reducedMotionQuery.matches || !window.ScrollTrigger) return;
      window.ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
      qsa("[data-reveal], [data-special-reveal]").forEach((element) => {
        element.style.removeProperty("opacity");
        element.style.removeProperty("visibility");
        element.style.removeProperty("transform");
      });
    };
    if (typeof reducedMotionQuery.addEventListener === "function") reducedMotionQuery.addEventListener("change", handleChange);
    else reducedMotionQuery.addListener(handleChange);
  }

  /* ====================================================================
     08 · APP-INITIALISIERUNG
     ==================================================================== */
  function initApp() {
    initCurrentYear();
    initPlaceholderLinks();
    initMobileNavigation();
    initProjectCarousel();
    initOfferWizard();
    initHorizontalScrollers();
    initFAQ();
    initConceptDialog();
    initLegalDialogs();
    initSparkStar();
    initScrollAnimations();
    initReducedMotionListener();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initApp, { once: true });
  else initApp();
})();
