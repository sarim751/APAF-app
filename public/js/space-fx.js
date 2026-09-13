// Mars Express Cosmic Background Canvas & Mission Control HUD Script
(function () {
  // 1. Particle Canvas Background
  function initSpaceCanvas() {
    const canvas = document.getElementById('spaceCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    const particles = [];
    const particleCount = Math.min(Math.floor(window.innerWidth / 16), 85);

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.5 + 0.5,
        speedX: (Math.random() - 0.5) * 0.25,
        speedY: (Math.random() - 0.5) * 0.25,
        alpha: Math.random() * 0.7 + 0.2,
        pulsing: Math.random() > 0.5,
        pulseSpeed: Math.random() * 0.02 + 0.005
      });
    }

    function render() {
      ctx.clearRect(0, 0, width, height);

      // Draw subtle orbital grid circles in center-right
      const cx = width * 0.85;
      const cy = height * 0.3;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 180, 0, Math.PI * 2);
      ctx.arc(cx, cy, 320, 0, Math.PI * 2);
      ctx.stroke();

      // Render drifting stars
      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        if (p.pulsing) {
          p.alpha += p.pulseSpeed;
          if (p.alpha > 0.85 || p.alpha < 0.2) p.pulseSpeed = -p.pulseSpeed;
        }

        ctx.fillStyle = `rgba(186, 230, 253, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      requestAnimationFrame(render);
    }
    render();
  }

  // 2. Mission Clock (UTC & Simulated MEX Mars Time)
  function initMissionClock() {
    const clockEl = document.getElementById('utcClock');
    const solEl = document.getElementById('marsSol');
    if (!clockEl) return;

    function update() {
      const now = new Date();
      clockEl.textContent = 'UTC ' + now.toUTCString().slice(17, 25);
      if (solEl) {
        // Approximate MEX simulated mission elapsed orbit counter
        const orbitNum = 23842 + Math.floor((now.getTime() % 86400000) / 3600000);
        solEl.textContent = 'MEX ORBIT #' + orbitNum;
      }
    }
    update();
    setInterval(update, 1000);
  }

  // 3. High-Tech Aerospace Toast Notification System
  window.showToast = function (message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `hud-toast ${type}`;

    const icon = type === 'success' ? '✔' : type === 'error' ? '✖' : 'ℹ';
    toast.innerHTML = `
      <span style="font-weight: 700; color: ${
        type === 'success' ? '#34d399' : type === 'error' ? '#f87171' : '#38bdf8'
      }">${icon}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  };

  // 4. Aesthetic JSON Syntax Highlighter
  window.syntaxHighlightJson = function (json) {
    if (typeof json !== 'string') {
      json = JSON.stringify(json, null, 2);
    }
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return '<span class="' + cls + '">' + match + '</span>';
    });
  };

  // 5. Auto-highlight all pre tags inside .code-viewer
  function highlightAllCodeViewers() {
    document.querySelectorAll('.code-viewer pre').forEach(pre => {
      try {
        const raw = pre.textContent.trim();
        if (raw.startsWith('{') || raw.startsWith('[')) {
          const parsed = JSON.parse(raw);
          pre.innerHTML = window.syntaxHighlightJson(parsed);
        }
      } catch (e) {
        // Leave as is if parse fails
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSpaceCanvas();
    initMissionClock();
    highlightAllCodeViewers();
  });
})();

