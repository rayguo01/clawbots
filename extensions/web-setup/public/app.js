(function () {
  "use strict";
  var app = document.getElementById("app");
  var state = { step: 0 };

  function render() {
    app.innerHTML =
      '<div class="container"><h1>Nanobots Setup</h1><p class="subtitle">Loading...</p></div>';
    fetch("/api/setup/status")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        state.step = data.currentStep || 1;
        app.innerHTML =
          '<div class="container"><h1>Nanobots Setup</h1>' +
          '<p class="subtitle">Step ' +
          state.step +
          "</p>" +
          "<p>Setup wizard is running. Full UI coming soon.</p></div>";
      })
      .catch(function () {
        app.innerHTML =
          '<div class="container"><h1>Nanobots Setup</h1>' +
          '<p class="subtitle">Could not reach API.</p></div>';
      });
  }

  render();
})();
