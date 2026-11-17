(function () {
  var rain = document.createElement('div');
  rain.id = 'sa-rain';
  var icons = ['🎨','🖌️','🖼️','✏️','🖍️','🎭','🌅','🌸','⭐','🪄'];
  for (var i = 0; i < 28; i++) {
    var d = document.createElement('span');
    d.className = 'sa-drop';
    d.textContent = icons[Math.floor(Math.random() * icons.length)];
    d.style.left = Math.random() * 100 + 'vw';
    d.style.fontSize = (16 + Math.random() * 22) + 'px';
    var fall = 8 + Math.random() * 10;
    d.style.animationDuration = fall + 's,' + (3 + Math.random() * 3) + 's';
    d.style.animationDelay = (-Math.random() * fall) + 's,0s';
    rain.appendChild(d);
  }
  document.body.appendChild(rain);

  var map = {HUMO:'sa-humo',UZCARD:'sa-uzcard',VISA:'sa-visa',MASTERCARD:'sa-mastercard'};
  function style() {
    var ft = document.querySelector('footer, #main-footer, #footer, .footer');
    if (ft) ft.classList.add('sa-ft');
    document.querySelectorAll('body *').forEach(function (el) {
      if (el.children.length) return;
      var t = el.textContent.trim().toUpperCase();
      if (map[t] && !el.classList.contains('sa-pay')) {
        el.classList.add('sa-pay', map[t]);
      }
    });
  }
  style();
  new MutationObserver(style).observe(document.body, {childList:true, subtree:true});
})();