/**
 * K11 OMNI ELITE — Onboarding Premium v3
 * ════════════════════════════════════════
 * Adicionar no dashboard.html antes de </body>:
 *   <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800;900&display=swap" rel="stylesheet">
 *   <script src="k11-onboarding.js"></script>
 *
 * Aparece apenas na primeira vez (localStorage).
 */
'use strict';
(function(){
  if(localStorage.getItem('k11_onboarding_v2')) return;

  // Inject full onboarding by loading the HTML into an iframe-like overlay
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:none;z-index:99999;background:#030509';
  frame.src = 'k11-onboarding-preview.html';

  // Listen for close message
  window.addEventListener('message', function(e){
    if(e.data === 'k11-onboarding-close'){
      localStorage.setItem('k11_onboarding_v2','1');
      frame.style.animation = 'ob-leave .3s ease forwards';
      setTimeout(()=>frame.remove(), 350);
    }
  });

  document.body.appendChild(frame);
})();
