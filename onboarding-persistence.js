(() => {
  async function loadSignupSchools() {
    if (!cloudMode || !sb || user()) return;
    try {
      const { data, error } = await sb.rpc("list_signup_schools");
      if (error) {
        console.warn("Signup school directory unavailable:", error.message);
        return;
      }
      if (!Array.isArray(data) || !data.length) return;
      state.schools = data.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.school_code || "",
        region: row.region || "",
        division: row.division || "",
        district: ""
      }));
      render();
    } catch (error) {
      console.warn("Signup school directory unavailable:", error);
    }
  }

  function enhancedMapProfile(row) {
    return {
      id: row.id,
      name: row.full_name,
      email: row.email,
      role: String(row.role || "student").trim(),
      school: row.school_name || "",
      schoolId: row.school_id || null,
      status: row.status || "active"
    };
  }

  try {
    mapProfile = enhancedMapProfile;
  } catch (error) {
    console.warn("Profile mapper enhancement could not attach:", error);
  }

  queueMicrotask(loadSignupSchools);
})();
