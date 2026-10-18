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


  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
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
  function initHeroCarousel() {
    const carousel = qs(".project-carousel");
    if (!carousel) return;

    const stage = qs(".project-carousel__stage", carousel);
    const ring = qs(".project-carousel__ring", carousel);
    const cards = qsa("article.project-card", carousel);
    const previousButton = qs(".carousel-arrow--previous", carousel);
    const nextButton = qs(".carousel-arrow--next", carousel);
    const dots = qsa(".carousel-dot", carousel);
    const status = qs(".project-carousel__status", carousel);

    const CARD_COUNT = 6;
    const ANGLE_PER_CARD = 60;
    const DRAG_DEGREES_PER_PIXEL = .22;
    const DRAG_THRESHOLD = 7;
    const SNAP_DURATION = 720;

    if (!stage || !ring || cards.length !== CARD_COUNT || dots.length !== CARD_COUNT) return;

    let currentSlide = 0;
    let currentRotation = 0;
    let pointerId = null;
    let dragStartX = 0;
    let dragStartRotation = 0;
    let dragDistance = 0;
    let isDragging = false;
    let suppressClick = false;

    function normaliseIndex(index) {
      return ((index % CARD_COUNT) + CARD_COUNT) % CARD_COUNT;
    }

    function getTilt() {
      const tilt = parseFloat(getComputedStyle(carousel).getPropertyValue("--carousel-tilt"));
      return Number.isFinite(tilt) ? tilt : -8;
    }

    function updateInterface() {
      cards.forEach((card, index) => {
        const relative = normaliseIndex(index - currentSlide);
        const distance = Math.min(relative, CARD_COUNT - relative);
        const isActive = index === currentSlide;
        card.classList.toggle("is-active", isActive);
        card.classList.toggle("is-near", distance === 1);
        card.classList.toggle("is-far-side", distance === 2);
        card.classList.toggle("is-rear", distance === 3);
        card.setAttribute("aria-current", isActive ? "true" : "false");
      });

      dots.forEach((dot, index) => {
        const isActive = index === currentSlide;
        dot.classList.toggle("is-active", isActive);
        dot.setAttribute("aria-current", isActive ? "true" : "false");
      });

      if (status) status.textContent = `Projekt ${currentSlide + 1} von ${CARD_COUNT}`;
    }

    /* Verbindliche Kernfunktion aus der Nutzervorlage. Die rotateX-Neigung
       bleibt bei jeder Rotation erhalten. Reduced Motion setzt nur die Dauer
       auf 0 und entfernt niemals die räumliche Ringgeometrie. */
    function setRotation(rotation, animate = true) {
      currentRotation = rotation;
      const duration = animate && !isReducedMotion() ? SNAP_DURATION : 0;
      ring.style.transition = `transform ${duration}ms cubic-bezier(.22, 1, .36, 1)`;
      ring.style.transform = `translate(-50%, -50%) rotateX(${getTilt()}deg) rotateY(${rotation}deg)`;
    }

    /* Verbindliche Kernfunktion aus der Nutzervorlage. Das Ziel wird auf die
       nächstgelegene äquivalente 360°-Position abgebildet, damit beim Wechsel
       zwischen Karte 6 und 1 kein unnötiger Vollkreis entsteht. */
    function goToSlide(index, animate = true) {
      currentSlide = normaliseIndex(index);
      const baseRotation = -currentSlide * ANGLE_PER_CARD;
      const nearestRotation = baseRotation + 360 * Math.round((currentRotation - baseRotation) / 360);
      setRotation(nearestRotation, animate);
      updateInterface();
    }

    function snapToNearestCard() {
      const nearestStep = Math.round(-currentRotation / ANGLE_PER_CARD);
      currentSlide = normaliseIndex(nearestStep);
      setRotation(-nearestStep * ANGLE_PER_CARD, true);
      updateInterface();
    }

    function onPointerDown(event) {
      if (event.button !== 0) return;
      pointerId = event.pointerId;
      dragStartX = event.clientX;
      dragStartRotation = currentRotation;
      dragDistance = 0;
      isDragging = true;
      suppressClick = false;
      stage.classList.add("is-dragging");
      ring.style.transition = "none";
      stage.setPointerCapture?.(pointerId);
    }

    function onPointerMove(event) {
      if (!isDragging || event.pointerId !== pointerId) return;
      dragDistance = event.clientX - dragStartX;
      if (Math.abs(dragDistance) > DRAG_THRESHOLD) suppressClick = true;
      setRotation(dragStartRotation + dragDistance * DRAG_DEGREES_PER_PIXEL, false);
    }

    function onPointerEnd(event) {
      if (!isDragging || event.pointerId !== pointerId) return;
      isDragging = false;
      stage.classList.remove("is-dragging");
      if (stage.hasPointerCapture?.(pointerId)) stage.releasePointerCapture(pointerId);
      pointerId = null;
      snapToNearestCard();
      window.setTimeout(() => { suppressClick = false; }, 0);
    }

    function onKeydown(event) {
      const actions = {
        ArrowLeft: () => goToSlide(currentSlide - 1),
        ArrowRight: () => goToSlide(currentSlide + 1),
        Home: () => goToSlide(0),
        End: () => goToSlide(CARD_COUNT - 1)
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    }

    previousButton?.addEventListener("click", () => goToSlide(currentSlide - 1));
    nextButton?.addEventListener("click", () => goToSlide(currentSlide + 1));
    dots.forEach((dot, index) => dot.addEventListener("click", () => goToSlide(index)));
    carousel.addEventListener("keydown", onKeydown);
    stage.addEventListener("dragstart", (event) => event.preventDefault());
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", onPointerEnd);
    stage.addEventListener("pointercancel", onPointerEnd);

    /* Klickunterdrückung ist trotz nicht verlinkter article-Karten enthalten,
       damit spätere Projektlinks nach einer Drag-Geste nicht versehentlich
       ausgelöst werden. */
    carousel.addEventListener("click", (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    window.addEventListener("resize", () => setRotation(currentRotation, false), { passive: true });

    setRotation(0, false);
    updateInterface();
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
     07 · GSAP, WIEDERHOLBARE VIEWPORT-REVEALS, STAR-SCHIMMER UND
          REDUCED MOTION

     Transform-Zuständigkeiten:
     - GSAP bewegt die vier äußeren Möglichkeiten nur beim Eintritt.
     - Der Sternschimmer bewegt ausschließlich .spark-star__shine.
     - Die dauerhafte Qualitäts-Randanimation bleibt vollständig in CSS.
     Dadurch konkurrieren keine GSAP- und CSS-Transforms am selben Layer.
     ==================================================================== */
  function initSparkStar() {
    const star = qs("[data-spark-star]");
    if (!star || !window.gsap || isReducedMotion()) return;
    const shine = qs("[data-star-shimmer]", star);
    if (!shine) return;
    let running = false;

    const playShimmer = () => {
      if (running) return;
      running = true;
      window.gsap.killTweensOf(shine);
      window.gsap.fromTo(shine,
        { xPercent: 0, autoAlpha: 0 },
        {
          xPercent: 620,
          autoAlpha: 1,
          duration: 1.05,
          ease: "power2.inOut",
          onComplete: () => {
            window.gsap.set(shine, { autoAlpha: 0, xPercent: 0 });
            running = false;
          }
        }
      );
    };

    star.addEventListener("pointerenter", playShimmer);
    star.addEventListener("focus", playShimmer);
    star._playShimmer = playShimmer;
  }

  function initScrollAnimations() {
    if (!window.gsap || !window.ScrollTrigger || isReducedMotion()) return;
    window.gsap.registerPlugin(window.ScrollTrigger);

    qsa("[data-reveal]").forEach((element) => {
      window.gsap.from(element, { autoAlpha: 0, y: 30, duration: .85, ease: "power3.out", clearProps: "transform,opacity,visibility", scrollTrigger: { trigger: element, start: "top 88%", once: true } });
    });
    /* Wiederholbar statt once:true: Nach jedem vollständigen Verlassen wird
       das Element zurückgesetzt. Beim erneuten Eintritt von oben oder unten
       spielt genau eine Sequenz ab und bleibt danach ruhig. */
    qsa("[data-special-reveal]").forEach((element) => {
      const direction = element.dataset.specialReveal;
      const offset = direction === "left"
        ? { x: -80, y: 0, scale: 1, rotation: 0 }
        : direction === "right"
          ? { x: 80, y: 0, scale: 1, rotation: 0 }
          : direction === "star"
            ? { x: 0, y: 30, scale: .82, rotation: -7 }
            : { x: 0, y: 70, scale: 1, rotation: 0 };

      const reset = () => window.gsap.set(element, { autoAlpha: 0, ...offset });
      const play = () => {
        window.gsap.killTweensOf(element);
        window.gsap.to(element, {
          autoAlpha: 1,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          duration: .9,
          ease: "power3.out",
          overwrite: "auto",
          clearProps: "transform,opacity,visibility"
        });
        if (element.matches("[data-spark-star]")) {
          window.setTimeout(() => element._playShimmer?.(), 240);
        }
      };

      reset();
      window.ScrollTrigger.create({
        trigger: element,
        start: "top 86%",
        end: "bottom 12%",
        onEnter: play,
        onEnterBack: play,
        onLeave: reset,
        onLeaveBack: reset
      });
    });

    const heroCopy = qs("[data-hero-copy]");
    if (heroCopy) {
      window.gsap.timeline({ defaults: { ease: "power3.out" } })
        .from(qsa(":scope > *", heroCopy), { autoAlpha: 0, y: 24, duration: .75, stagger: .08 });
    }

    /* Technisch notwendige Abweichung von der globalen Hero-Animation:
       .project-carousel und .project-carousel__ring werden hier absichtlich
       nicht von GSAP transformiert. setRotation() ist der einzige Schreiber
       für die Ring-Transformation; konkurrierende GSAP-Matrizen würden den
       räumlichen 3D-Kontext überschreiben oder optisch abflachen. */

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
    initHeroCarousel();
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
