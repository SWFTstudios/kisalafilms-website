(() => {
  const progressRoot = document.querySelector("[data-progress]");
  if (progressRoot) {
    const fills = progressRoot.querySelectorAll(".progress-fill");
    const run = () => {
      fills.forEach((el) => {
        const w = el.getAttribute("data-width") || "0";
        el.style.width = `${w}%`;
      });
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              run();
              io.disconnect();
            }
          });
        },
        { threshold: 0.35 }
      );
      io.observe(progressRoot);
    } else {
      run();
    }
  }
})();
