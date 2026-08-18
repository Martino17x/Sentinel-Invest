function $<T extends Element>(sel: string): T | null {
  return document.querySelector<T>(sel);
}

export function initLightbox(): void {
  const dialog = document.getElementById("image-lightbox") as HTMLDialogElement | null;
  if (!dialog || !("showModal" in dialog)) return;
  if (dialog.dataset.bound === "true") return;
  dialog.dataset.bound = "true";

  const img = $<HTMLImageElement>("#lightbox-img");
  const caption = $<HTMLElement>("#lightbox-caption");
  const counter = $<HTMLElement>("#lightbox-counter");
  const prev = $<HTMLButtonElement>("#lightbox-prev");
  const next = $<HTMLButtonElement>("#lightbox-next");
  const closeBtn = $<HTMLButtonElement>("#lightbox-close");
  const stage = $<HTMLElement>("#lightbox-stage");
  if (!img || !caption || !counter || !prev || !next || !closeBtn || !stage) return;

  const dialogEl = dialog;
  const image = img;
  const captionEl = caption;
  const counterEl = counter;
  const prevBtn = prev;
  const nextBtn = next;
  const closeBtnEl = closeBtn;
  const stageEl = stage;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  let list: HTMLElement[] = [];
  let index = 0;
  let lastTrigger: HTMLElement | null = null;
  let closing = false;

  const groups = new Map<string, HTMLElement[]>();
  document.querySelectorAll<HTMLElement>("[data-lightbox]").forEach((t) => {
    const g = t.getAttribute("data-lightbox") ?? "default";
    const arr = groups.get(g) ?? [];
    arr.push(t);
    groups.set(g, arr);
  });

  function renderImage(): void {
    const t = list[index];
    if (!t) return;
    const innerImg = t.querySelector("img");
    image.src = t.getAttribute("data-lightbox-src") ?? innerImg?.src ?? "";
    image.alt = t.getAttribute("data-lightbox-alt") ?? innerImg?.alt ?? "";
    captionEl.textContent = t.getAttribute("data-lightbox-caption") ?? image.alt;
    counterEl.textContent = `${index + 1} / ${list.length}`;
  }

  function open(groupId: string, i: number): void {
    list = groups.get(groupId) ?? [];
    if (list.length === 0) return;
    index = i;
    lastTrigger = list[i] ?? null;
    renderImage();

    const multi = list.length > 1;
    prevBtn.hidden = !multi;
    nextBtn.hidden = !multi;
    counterEl.hidden = !multi;

    if (!dialogEl.open) {
      dialogEl.showModal();
      requestAnimationFrame(() => dialogEl.classList.add("is-open"));
    }
    stageEl.focus({ preventScroll: true });
  }

  function step(dir: 1 | -1): void {
    if (list.length <= 1) return;
    index = (index + dir + list.length) % list.length;
    // State-first: la imagen y el contador se actualizan al instante (robusto
    // aunque el timeline de animaciones no avance, p. ej. en pestañas ocultas).
    renderImage();
    if (reduce.matches) return;
    image.getAnimations().forEach((a) => a.cancel());
    image.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
    );
  }

  function close(): void {
    if (closing) return;
    closing = true;
    dialogEl.classList.remove("is-open");
    dialogEl.classList.add("is-closing");

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      dialogEl.close();
      dialogEl.classList.remove("is-closing");
      closing = false;
      lastTrigger?.focus({ preventScroll: true });
      lastTrigger = null;
    };
    dialogEl.addEventListener(
      "transitionend",
      (e) => {
        if (e.target === dialog) finish();
      },
      { once: true }
    );
    setTimeout(finish, reduce.matches ? 0 : 220);
  }

  document.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-lightbox]");
    if (!t) return;
    const g = t.getAttribute("data-lightbox") ?? "default";
    open(g, groups.get(g)?.indexOf(t) ?? 0);
  });

  dialogEl.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  dialogEl.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  dialogEl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  });
  closeBtnEl.addEventListener("click", close);
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));

  // View Transitions: cerrar sin animación antes del swap
  document.addEventListener("astro:before-swap", () => {
    if (dialogEl.open) {
      dialogEl.close();
      dialogEl.classList.remove("is-open", "is-closing");
      closing = false;
    }
  });
}
