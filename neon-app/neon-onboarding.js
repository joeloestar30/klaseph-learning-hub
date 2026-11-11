// A verified Neon identity is required before creating an application profile.
window.completeNeonProfile = async function completeNeonProfile() {
  let metadata = sb.pendingProfile();
  if (!metadata) metadata = await new Promise((resolve) => {
    app.innerHTML = `<main class="auth-wrap"><section class="auth-card"><h1>Complete your account</h1><p>Choose how you will use KlasePH.</p><form id="profileSetup" class="form-grid"><label class="full">Full name<input name="full_name" required maxlength="200"></label><label class="full">Role<select name="role"><option value="student">Student</option><option value="teacher">Teacher</option></select></label><label class="full">School<input name="school_name" maxlength="200"></label><button class="button full">Continue</button></form></section></main>`;
    document.querySelector('#profileSetup').addEventListener('submit', event => {
      event.preventDefault();
      event.currentTarget.querySelector('button').disabled = true;
      resolve(Object.fromEntries(new FormData(event.currentTarget)));
    },{once:true});
  });
  const {error} = await sb.rpc('complete_onboarding',{metadata});
  if (error) throw error;
  sb.clearPendingProfile();
};
