(() => {
  const REMEMBERED_EMAIL_KEY = "klaseph-remembered-email";
  let recoveryMode = false;

  function schoolDatalist() {
    const schools = Array.isArray(state?.schools) ? state.schools : [];
    if (!schools.length) return "";
    return `<datalist id="schoolList">${schools.map((school) => `<option value="${esc(school.name)}">${esc([school.region, school.division].filter(Boolean).join(" · "))}</option>`).join("")}</datalist>`;
  }

  function enhancedAuthScreen() {
    const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY) || "";
    const demo = cloudMode ? "" : `
      <div class="demo-logins auth-demo">
        <button class="quick-login" data-login="admin@klaseph.test">Admin demo</button>
        <button class="quick-login" data-login="teacher@klaseph.test">Teacher demo</button>
        <button class="quick-login" data-login="ana@klaseph.test">Student demo</button>
      </div>`;

    return `
      <main class="auth-wrap auth-v2">
        <section class="auth-panel auth-welcome">
          <div class="brand">
            <div class="mark">K</div>
            <div><strong>KlasePH</strong><span>${t("subtitle")}</span></div>
          </div>
          <div class="auth-hero-copy">
            <div class="eyebrow">Philippine classroom companion</div>
            <h1>Your classroom, connected.</h1>
            <p>Manage classes, activities, assessments, records, and learner progress in one mobile-friendly workspace.</p>
          </div>
          <div class="auth-benefits">
            <span>Teacher & student accounts</span>
            <span>Supabase cloud sync</span>
            <span>Offline-friendly PWA</span>
          </div>
          ${demo}
        </section>

        <section class="auth-card auth-card-v2">
          <div class="auth-tabs" role="tablist" aria-label="Account access">
            <button type="button" class="auth-tab active" data-auth-tab="login">Sign in</button>
            <button type="button" class="auth-tab" data-auth-tab="signup">Create account</button>
          </div>

          <form id="loginForm" class="form-grid auth-form" data-auth-panel="login">
            <div class="full auth-heading">
              <h2>Welcome back</h2>
              <p>Sign in to continue to your KlasePH workspace.</p>
            </div>
            <label class="full">Email address
              <input name="email" type="email" autocomplete="email" value="${esc(cloudMode ? rememberedEmail : "teacher@klaseph.test")}" required placeholder="name@example.com">
            </label>
            <label class="full">Password
              <div class="password-field">
                <input name="password" type="password" autocomplete="current-password" value="${cloudMode ? "" : "teacher123"}" required placeholder="Enter your password">
                <button type="button" class="password-toggle" data-password-toggle="loginForm" aria-label="Show password">Show</button>
              </div>
            </label>
            <div class="full auth-row">
              <label class="inline-check"><input type="checkbox" name="rememberEmail" ${rememberedEmail ? "checked" : ""}><span>Remember email on this device</span></label>
              ${cloudMode ? `<button type="button" class="text-button" id="forgotPassword">Forgot password?</button>` : ""}
            </div>
            <button class="button full auth-primary" type="submit">Sign in</button>
            <p class="full auth-switch-copy">New to KlasePH? <button type="button" class="text-button" data-open-signup>Create an account</button></p>
          </form>

          <form id="signupForm" class="form-grid auth-form hidden" data-auth-panel="signup" novalidate>
            <div class="full auth-heading">
              <h2>Create your account</h2>
              <p>Set up a teacher or student profile. Administrator roles are assigned by invitation only.</p>
            </div>

            <div class="full signup-progress" aria-label="Signup progress">
              <span class="active" data-step-dot="1">1</span><i></i><span data-step-dot="2">2</span><i></i><span data-step-dot="3">3</span>
            </div>

            <section class="full signup-step" data-signup-step="1">
              <div class="step-copy"><b>Step 1 · Account type</b><span>Choose the role you will use in KlasePH.</span></div>
              <div class="role-picker">
                <label><input type="radio" name="role" value="teacher" checked><span><b>Teacher</b><small>Create classes, activities, assessments, and records.</small></span></label>
                <label><input type="radio" name="role" value="student"><span><b>Student</b><small>Join classes, submit work, and view feedback.</small></span></label>
              </div>
              <button type="button" class="button full" data-next-step="2">Continue</button>
            </section>

            <section class="full signup-step hidden" data-signup-step="2">
              <div class="step-copy"><b>Step 2 · Account details</b><span>Use an email address you can access for verification and password recovery.</span></div>
              <div class="form-grid nested-grid">
                <label class="full">Full name<input name="name" autocomplete="name" required placeholder="Juan Dela Cruz"></label>
                <label class="full">Email address<input name="email" type="email" autocomplete="email" required placeholder="name@example.com"></label>
                <label class="full">Password
                  <div class="password-field">
                    <input name="password" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters">
                    <button type="button" class="password-toggle" data-password-toggle="signupForm" aria-label="Show password">Show</button>
                  </div>
                </label>
                <div class="full password-strength" id="passwordStrength"><span></span><small>Use 8+ characters. A mix of letters, numbers, and symbols is stronger.</small></div>
                <label class="full">Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required placeholder="Re-enter your password"></label>
              </div>
              <div class="step-actions"><button type="button" class="ghost" data-prev-step="1">Back</button><button type="button" class="button" data-next-step="3">Continue</button></div>
            </section>

            <section class="full signup-step hidden" data-signup-step="3">
              <div class="step-copy"><b>Step 3 · School profile</b><span>This information helps organize school, class, and learner records.</span></div>
              <div class="form-grid nested-grid">
                <label>Region<input name="region" placeholder="e.g. Region IV-A"></label>
                <label>Schools Division Office<input name="division" placeholder="e.g. Laguna"></label>
                <label class="full">School name<input name="school" list="schoolList" required placeholder="Official school name"></label>
                <label>School ID <span class="optional">Optional</span><input name="schoolCode" placeholder="DepEd school ID"></label>
                <label>School year<input name="schoolYear" value="${esc(state?.settings?.schoolYear || "2026-2027")}" placeholder="2026-2027"></label>

                <div class="full role-fields" data-role-fields="teacher">
                  <div class="form-grid nested-grid">
                    <label>Employee/Teacher ID <span class="optional">Optional</span><input name="employeeId" placeholder="Employee ID"></label>
                    <label>Position/Designation<input name="position" placeholder="Teacher I"></label>
                    <label>Grade level(s)<input name="gradeLevels" placeholder="Grade 7, Grade 8"></label>
                    <label>Subject area(s)<input name="subjects" placeholder="Science, Mathematics"></label>
                    <label class="full">Advisory section <span class="optional">Optional</span><input name="advisorySection" placeholder="Grade 7 - Rizal"></label>
                  </div>
                </div>

                <div class="full role-fields hidden" data-role-fields="student">
                  <div class="form-grid nested-grid">
                    <label>LRN <span class="optional">Optional</span><input name="lrn" inputmode="numeric" maxlength="12" placeholder="Learner Reference Number"></label>
                    <label>Grade level<input name="gradeLevel" placeholder="Grade 7"></label>
                    <label>Section<input name="section" placeholder="Rizal"></label>
                    <label>Class join code <span class="optional">Optional</span><input name="joinCode" maxlength="8" placeholder="RIZ7"></label>
                  </div>
                </div>
              </div>
              <div class="privacy-note">Only provide information needed for your school account. Student LRN is optional at public sign-up and can be verified later by the school.</div>
              <div class="step-actions"><button type="button" class="ghost" data-prev-step="2">Back</button><button type="submit" class="button">Create account</button></div>
            </section>
          </form>
          ${schoolDatalist()}
        </section>
      </main>
      <div class="toast" id="toast"></div>
    `;
  }

  function setAuthTab(tab) {
    document.querySelectorAll("[data-auth-tab]").forEach((button) => button.classList.toggle("active", button.dataset.authTab === tab));
    document.querySelectorAll("[data-auth-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.authPanel !== tab));
  }

  function setSignupStep(step) {
    document.querySelectorAll("[data-signup-step]").forEach((panel) => panel.classList.toggle("hidden", Number(panel.dataset.signupStep) !== step));
    document.querySelectorAll("[data-step-dot]").forEach((dot) => dot.classList.toggle("active", Number(dot.dataset.stepDot) <= step));
  }

  function currentSignupRole() {
    return document.querySelector('#signupForm input[name="role"]:checked')?.value || "teacher";
  }

  function syncRoleFields() {
    const selected = currentSignupRole();
    document.querySelectorAll("[data-role-fields]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.roleFields !== selected));
  }

  function validateSignupStep(step) {
    const panel = document.querySelector(`[data-signup-step="${step}"]`);
    if (!panel) return true;
    const fields = [...panel.querySelectorAll("input, select, textarea")].filter((field) => !field.closest(".hidden") && field.type !== "radio");
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    if (step === 2) {
      const form = document.querySelector("#signupForm");
      const password = form.elements.password.value;
      const confirmation = form.elements.confirmPassword.value;
      if (password !== confirmation) {
        toast("Passwords do not match.");
        form.elements.confirmPassword.focus();
        return false;
      }
    }
    return true;
  }

  function passwordScore(value) {
    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    return Math.min(score, 4);
  }

  function updatePasswordStrength(value) {
    const node = document.querySelector("#passwordStrength");
    if (!node) return;
    const score = passwordScore(value);
    node.dataset.score = String(score);
    node.querySelector("small").textContent = score <= 1 ? "Weak — add length and a mix of characters." : score === 2 ? "Fair — consider adding uppercase, numbers, or symbols." : score === 3 ? "Good password." : "Strong password.";
  }

  function setButtonBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = label;
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalLabel || button.textContent;
    }
  }

  async function enhancedEnsureCloudProfile(id, data) {
    const { error } = await sb.from("profiles").upsert({
      id,
      email: data.email,
      full_name: data.name,
      role: data.role,
      school_name: data.school || ""
    });
    if (error) throw error;
  }

  async function sendPasswordReset() {
    if (!cloudMode) return toast("Password reset is available in cloud mode.");
    const emailInput = document.querySelector('#loginForm input[name="email"]');
    const email = emailInput?.value?.trim();
    if (!email || !emailInput.checkValidity()) {
      emailInput?.reportValidity();
      return;
    }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${window.location.pathname}` });
    if (error) return toast(error.message);
    toast("Password reset email sent. Check your inbox.");
  }

  function showRecoveryScreen() {
    recoveryMode = true;
    app.innerHTML = `
      <main class="auth-wrap auth-v2 single-auth">
        <section class="auth-panel auth-welcome">
          <div class="brand"><div class="mark">K</div><div><strong>KlasePH</strong><span>${t("subtitle")}</span></div></div>
          <div class="auth-hero-copy"><div class="eyebrow">Account recovery</div><h1>Choose a new password.</h1><p>Use a strong password you have not used for this account before.</p></div>
        </section>
        <section class="auth-card auth-card-v2">
          <form id="recoveryForm" class="form-grid auth-form">
            <div class="full auth-heading"><h2>Reset password</h2><p>Your new password must contain at least 8 characters.</p></div>
            <label class="full">New password<input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
            <label class="full">Confirm new password<input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></label>
            <button class="button full" type="submit">Update password</button>
          </form>
        </section>
      </main>
      <div class="toast" id="toast"></div>`;
    document.querySelector("#recoveryForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (form.elements.password.value !== form.elements.confirmPassword.value) return toast("Passwords do not match.");
      const button = form.querySelector('button[type="submit"]');
      setButtonBusy(button, true, "Updating...");
      const { error } = await sb.auth.updateUser({ password: form.elements.password.value });
      setButtonBusy(button, false);
      if (error) return toast(error.message);
      recoveryMode = false;
      history.replaceState({}, document.title, window.location.pathname);
      toast("Password updated. You can continue to KlasePH.");
      setTimeout(() => init(), 700);
    });
  }

  function enhancedBindAuth() {
    document.querySelectorAll("[data-auth-tab]").forEach((button) => button.addEventListener("click", () => setAuthTab(button.dataset.authTab)));
    document.querySelectorAll("[data-open-signup]").forEach((button) => button.addEventListener("click", () => setAuthTab("signup")));
    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const form = document.getElementById(button.dataset.passwordToggle);
        const input = form?.querySelector('input[name="password"]');
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Hide" : "Show";
        button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      });
    });
    document.querySelector("#forgotPassword")?.addEventListener("click", sendPasswordReset);

    document.querySelectorAll('#signupForm input[name="role"]').forEach((input) => input.addEventListener("change", syncRoleFields));
    document.querySelector('#signupForm input[name="password"]')?.addEventListener("input", (event) => updatePasswordStrength(event.target.value));
    document.querySelectorAll("[data-next-step]").forEach((button) => button.addEventListener("click", () => {
      const currentStep = Number(button.closest("[data-signup-step]")?.dataset.signupStep || 1);
      if (!validateSignupStep(currentStep)) return;
      setSignupStep(Number(button.dataset.nextStep));
    }));
    document.querySelectorAll("[data-prev-step]").forEach((button) => button.addEventListener("click", () => setSignupStep(Number(button.dataset.prevStep))));

    document.querySelector("#loginForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      const button = form.querySelector('button[type="submit"]');
      setButtonBusy(button, true, "Signing in...");
      if (data.rememberEmail) localStorage.setItem(REMEMBERED_EMAIL_KEY, data.email.trim());
      else localStorage.removeItem(REMEMBERED_EMAIL_KEY);

      if (cloudMode) {
        const { data: authData, error } = await sb.auth.signInWithPassword({ email: data.email.trim(), password: data.password });
        if (error) {
          setButtonBusy(button, false);
          return toast(error.message);
        }
        try {
          await loadCloudData(authData.user.id);
          state.view = "dashboard";
          render();
        } catch (error) {
          setButtonBusy(button, false);
          toast(error.message || String(error));
        }
        return;
      }

      const found = state.users.find((item) => item.email.toLowerCase() === data.email.toLowerCase() && item.password === data.password);
      if (!found) {
        setButtonBusy(button, false);
        return toast("Account not found. Check email and password.");
      }
      state.currentUserId = found.id;
      state.view = "dashboard";
      persist();
      render();
    });

    document.querySelector("#signupForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateSignupStep(2) || !validateSignupStep(3)) return;
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      if (data.password !== data.confirmPassword) return toast("Passwords do not match.");
      const button = form.querySelector('button[type="submit"]');
      setButtonBusy(button, true, "Creating account...");

      const metadata = {
        full_name: data.name,
        role: data.role,
        school_name: data.school || "",
        school_code: data.schoolCode || "",
        region: data.region || "",
        division: data.division || "",
        school_year: data.schoolYear || "",
        employee_id: data.role === "teacher" ? data.employeeId || "" : "",
        position: data.role === "teacher" ? data.position || "" : "",
        grade_levels: data.role === "teacher" ? data.gradeLevels || "" : "",
        subjects: data.role === "teacher" ? data.subjects || "" : "",
        advisory_section: data.role === "teacher" ? data.advisorySection || "" : "",
        lrn: data.role === "student" ? data.lrn || "" : "",
        grade_level: data.role === "student" ? data.gradeLevel || "" : "",
        section: data.role === "student" ? data.section || "" : "",
        join_code: data.role === "student" ? data.joinCode || "" : ""
      };

      if (cloudMode) {
        const { data: authData, error } = await sb.auth.signUp({
          email: data.email.trim(),
          password: data.password,
          options: { data: metadata }
        });
        if (error) {
          setButtonBusy(button, false);
          return toast(error.message);
        }
        if (!authData.user || !authData.session) {
          setButtonBusy(button, false);
          setAuthTab("login");
          document.querySelector('#loginForm input[name="email"]')?.setAttribute("value", data.email.trim());
          return toast("Account created. Check your email to verify it, then sign in.");
        }
        try {
          await enhancedEnsureCloudProfile(authData.user.id, data);
          await loadCloudData(authData.user.id);
          if (data.role === "student" && data.joinCode) {
            const { error: joinError } = await sb.rpc("join_class_by_code", { code_input: data.joinCode });
            if (joinError) console.warn("Optional class join skipped:", joinError.message);
            else await loadCloudData(authData.user.id);
          }
          state.view = "dashboard";
          render();
        } catch (error) {
          setButtonBusy(button, false);
          toast(error.message || String(error));
        }
        return;
      }

      if (state.users.some((item) => item.email.toLowerCase() === data.email.toLowerCase())) {
        setButtonBusy(button, false);
        return toast("Email already exists.");
      }
      const account = {
        id: crypto.randomUUID(), name: data.name, email: data.email.trim(), password: data.password, role: data.role,
        school: data.school, schoolCode: data.schoolCode, region: data.region, division: data.division, schoolYear: data.schoolYear,
        employeeId: data.employeeId || "", position: data.position || "", gradeLevels: data.gradeLevels || "", subjects: data.subjects || "", advisorySection: data.advisorySection || "",
        lrn: data.lrn || "", gradeLevel: data.gradeLevel || "", section: data.section || "", status: "active"
      };
      state.users.push(account);
      state.currentUserId = account.id;
      if (data.role === "student" && data.joinCode) {
        const foundClass = state.classes.find((item) => item.code.toLowerCase() === data.joinCode.toLowerCase());
        if (foundClass) state.memberships.push({ classId: foundClass.id, userId: account.id, attendance: "present" });
      }
      state.view = "dashboard";
      persist();
      render();
    });

    document.querySelectorAll("[data-login]").forEach((button) => {
      button.addEventListener("click", () => {
        const found = state.users.find((item) => item.email === button.dataset.login);
        if (!found) return;
        state.currentUserId = found.id;
        state.view = "dashboard";
        persist();
        render();
      });
    });
  }

  try {
    authScreen = enhancedAuthScreen;
    bindAuth = enhancedBindAuth;
    ensureCloudProfile = enhancedEnsureCloudProfile;
  } catch (error) {
    console.error("KlasePH auth enhancement could not attach:", error);
  }

  if (cloudMode && sb) {
    sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") showRecoveryScreen();
    });
    if (window.location.hash.includes("type=recovery")) showRecoveryScreen();
  }

  queueMicrotask(() => {
    if (!recoveryMode && !user()) render();
  });
})();
