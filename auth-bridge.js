(function authBridge() {
  if (window.location.protocol === "file:") {
    return;
  }

  function notify(message, tone) {
    if (typeof window.showToast === "function") {
      window.showToast(message, tone || "info");
      return;
    }
    window.alert(message);
  }

  async function hydrateSession() {
    if (typeof window.__sgeHydrateFromBackend === "function") {
      await window.__sgeHydrateFromBackend(true);
      return;
    }

    const response = await fetch("/api/bootstrap", {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "cache-control": "no-store"
      }
    });
    const payload = await response.json();
    if (!response.ok || !payload.authenticated) {
      throw new Error(payload.error || "No se pudo validar la sesion despues del ingreso.");
    }
    window.location.reload();
  }

  async function handleLoginSubmit(event) {
    const form = event.target?.closest?.("#loginForm");
    if (!form) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const submitButton = form.querySelector('button[type="submit"]');
    const originalLabel = submitButton ? submitButton.textContent : "";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Validando...";
    }

    try {
      const formData = new FormData(form);
      const response = await fetch("/api/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          username: String(formData.get("username") || "").trim().toLowerCase(),
          password: String(formData.get("password") || "")
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Credenciales invalidas.");
      }

      await hydrateSession();
      if (window.state?.session) {
        notify(`Bienvenido(a), ${window.state.session.name}.`, "success");
      }
    } catch (error) {
      notify(error.message || "No se pudo iniciar sesion.", "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel || "Ingresar al sistema";
      }
    }
  }

  async function handleLogoutClick(event) {
    const button = event.target?.closest?.("#logoutBtn");
    if (!button) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin"
      });
      window.location.reload();
    } catch (error) {
      notify("No se pudo cerrar la sesion del servidor.", "error");
    }
  }

  document.addEventListener("submit", handleLoginSubmit, true);
  document.addEventListener("click", handleLogoutClick, true);
})();
