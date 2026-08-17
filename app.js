const STORE_KEY = "klaseph-hub-v2-state";
const cfg = window.KLASEPH_CONFIG || {};
const cloudConfigured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY && window.supabase);
const sb = cloudConfigured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
let cloudMode = cloudConfigured;
let booting = cloudMode;
let cloudError = "";

const seed = {
  lang: "en",
  view: "dashboard",
  adminTab: "directory",
  currentUserId: "u1",
  users: [
    { id: "u0", name: "Admin Reyes", email: "admin@klaseph.test", password: "admin123", role: "super_admin", school: "San Isidro National High School", status: "active" },
    { id: "u1", name: "Maria Santos", email: "teacher@klaseph.test", password: "teacher123", role: "teacher", school: "San Isidro National High School" },
    { id: "u2", name: "Ana Reyes", email: "ana@klaseph.test", password: "student123", role: "student", school: "San Isidro National High School" },
    { id: "u3", name: "Miguel Cruz", email: "miguel@klaseph.test", password: "student123", role: "student", school: "San Isidro National High School" }
  ],
  classes: [
    { id: "c1", name: "Grade 7 Rizal", subject: "Science", code: "RIZ7", teacherId: "u1", schedule: "Mon/Wed 9:00" },
    { id: "c2", name: "Grade 8 Mabini", subject: "Filipino", code: "MAB8", teacherId: "u1", schedule: "Tue/Thu 10:30" }
  ],
  memberships: [
    { classId: "c1", userId: "u2", attendance: "present" },
    { classId: "c1", userId: "u3", attendance: "late" },
    { classId: "c2", userId: "u2", attendance: "present" }
  ],
  activities: [
    {
      id: "a1",
      classId: "c1",
      teacherId: "u1",
      title: "Matter Around Us",
      type: "Activity",
      mode: "manual",
      due: "2026-08-19",
      status: "Open",
      instructions: "Answer in two to three sentences.",
      questions: [
        { id: "q1", type: "essay", prompt: "Describe one solid, one liquid, and one gas you can find at home.", points: 10, answer: "" }
      ]
    },
    {
      id: "a2",
      classId: "c1",
      teacherId: "u1",
      title: "Diagnostic Quiz: Matter",
      type: "Quiz",
      mode: "auto",
      due: "2026-08-16",
      status: "Open",
      instructions: "Choose the best answer.",
      questions: [
        { id: "q2", type: "mcq", prompt: "Which state of matter has a fixed shape?", choices: ["Solid", "Liquid", "Gas", "Plasma"], answer: "Solid", points: 1 },
        { id: "q3", type: "truefalse", prompt: "Liquids take the shape of their container.", choices: ["True", "False"], answer: "True", points: 1 },
        { id: "q4", type: "identification", prompt: "What process changes liquid water into water vapor?", answer: "evaporation", points: 1 }
      ]
    }
  ],
  submissions: [
    { id: "s1", activityId: "a2", studentId: "u2", answers: { q2: "Solid", q3: "True", q4: "evaporation" }, score: 3, maxScore: 3, feedback: "Auto-checked. Great work.", checkedAt: "2026-08-15" },
    { id: "s2", activityId: "a2", studentId: "u3", answers: { q2: "Liquid", q3: "True", q4: "evaporate" }, score: 1, maxScore: 3, feedback: "Auto-checked. Review the marked items.", checkedAt: "2026-08-15" }
  ],
  announcements: [
    { id: "n1", classId: "c1", message: "Bring recycled materials for Wednesday activity.", date: "2026-08-15" },
    { id: "n2", classId: "c2", message: "Read pages 12 to 15 before next meeting.", date: "2026-08-15" }
  ],
  schools: [
    { id: "school-local", name: "San Isidro National High School", code: "SINHS", region: "Region IV-A", division: "Laguna", district: "District 1" }
  ],
  adminInvites: [],
  auditLogs: [],
  settings: {
    schoolYear: "2026-2027",
    gradingComponents: ["Written Work", "Performance Task", "Quarterly Assessment"],
    examGeneratorEnabled: true,
    autoCheckEnabled: true,
    lateSubmissionsEnabled: false
  }
};

const text = {
  en: {
    title: "Learning Hub",
    subtitle: "Built for Philippine classrooms",
    dashboard: "Dashboard",
    classes: "Classes",
    activities: "Activities",
    exams: "Exams",
    records: "Records",
    users: "Users",
    admin: "Admin",
    super_admin: "Super Admin",
    school_admin: "School Admin",
    teacher: "Teacher",
    student: "Student",
    online: "Online",
    offline: "Offline draft mode",
    sync: "Efficient classroom workflow",
    syncCopy: "Multiple local accounts, generated assessments, auto-checking, and exportable records.",
    heroTeacher: "Create activities, generate exams, and check objective answers automatically.",
    heroAdmin: "Manage the school system, users, classes, and assessment activity from one place.",
    heroStudent: "Join classes, take online exams, submit work, and see feedback immediately.",
    heroCopy: "Cloud mode uses Supabase accounts and shared classroom records.",
    adminCopy: "You are signed in with administrator permissions. Use Users to review visible accounts and manage admin invites in Supabase.",
    activeClasses: "Active classes",
    openTasks: "Open tasks",
    autoChecked: "Auto-checked",
    toCheck: "Manual checking",
    addClass: "Add class",
    joinClass: "Join class",
    addActivity: "Add activity",
    generateExam: "Generate exam",
    takeExam: "Take exam",
    save: "Save",
    reset: "Reset demo",
    signOut: "Sign out",
    signIn: "Sign in",
    createAccount: "Create account",
    classRecord: "Class record",
    learnerProgress: "Learner progress",
    announcements: "Announcements",
    upcoming: "Upcoming work",
    noItems: "No items yet."
  },
  fil: {
    title: "Learning Hub",
    subtitle: "Para sa klasrum sa Pilipinas",
    dashboard: "Dashboard",
    classes: "Klase",
    activities: "Gawain",
    exams: "Exams",
    records: "Talaan",
    users: "Users",
    admin: "Admin",
    super_admin: "Super Admin",
    school_admin: "School Admin",
    teacher: "Guro",
    student: "Mag-aaral",
    online: "Online",
    offline: "Offline draft mode",
    sync: "Mas mabilis na workflow",
    syncCopy: "Maraming account, generated assessments, auto-checking, at records export.",
    heroTeacher: "Gumawa ng gawain, mag-generate ng exam, at mag-check ng objective answers.",
    heroAdmin: "Pamahalaan ang school system, users, classes, at assessment activity sa isang lugar.",
    heroStudent: "Sumali sa klase, sumagot ng exam, magsumite, at makita agad ang feedback.",
    heroCopy: "Cloud mode uses Supabase accounts and shared classroom records.",
    adminCopy: "Naka-sign in ka bilang administrator. Gamitin ang Users para makita ang accounts at Supabase para sa admin invites.",
    activeClasses: "Aktibong klase",
    openTasks: "Bukas na gawain",
    autoChecked: "Auto-checked",
    toCheck: "Manual check",
    addClass: "Magdagdag ng klase",
    joinClass: "Sumali sa klase",
    addActivity: "Magdagdag ng gawain",
    generateExam: "Gumawa ng exam",
    takeExam: "Sagutan ang exam",
    save: "I-save",
    reset: "I-reset demo",
    signOut: "Mag-sign out",
    signIn: "Mag-sign in",
    createAccount: "Gumawa ng account",
    classRecord: "Class record",
    learnerProgress: "Progress ng mag-aaral",
    announcements: "Anunsyo",
    upcoming: "Paparating",
    noItems: "Wala pang laman."
  }
};

const app = document.querySelector("#app");
let state = migrate(load());

async function init() {
  if (!cloudMode) {
    render();
    return;
  }

  try {
    app.innerHTML = `<div class="empty" style="min-height:100vh">Connecting to Supabase...</div>`;
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    const sessionUser = data.session?.user;
    if (!sessionUser) {
      state.currentUserId = null;
      booting = false;
      render();
      return;
    }
    await loadCloudData(sessionUser.id);
  } catch (error) {
    console.error(error);
    cloudError = error.message || String(error);
    booting = false;
    renderCloudError();
    return;
  }

  booting = false;
  render();
}

function renderCloudError() {
  app.innerHTML = `
    <main class="auth-wrap">
      <section class="auth-panel">
        <div class="brand">
          <div class="mark">K</div>
          <div><strong>KlasePH</strong><span>${t("subtitle")}</span></div>
        </div>
        <h1>Supabase connection needs attention</h1>
        <p>The app has cloud credentials, but Supabase returned an error before your profile could load.</p>
      </section>
      <section class="auth-card">
        <div class="standard-box">
          <b>Cloud error</b>
          <span>${esc(cloudError || "Unknown Supabase error")}</span>
        </div>
        <button class="button" id="retryCloud">Retry cloud connection</button>
        <button class="ghost" id="useLocalMode">Use local demo mode</button>
      </section>
    </main>
    <div class="toast" id="toast"></div>
  `;
  document.querySelector("#retryCloud")?.addEventListener("click", () => {
    cloudError = "";
    cloudMode = cloudConfigured;
    init();
  });
  document.querySelector("#useLocalMode")?.addEventListener("click", () => {
    cloudMode = false;
    render();
  });
}

function load() {
  const saved = localStorage.getItem(STORE_KEY);
  if (saved) return JSON.parse(saved);
  const old = localStorage.getItem("klaseph-hub-state");
  if (old) return JSON.parse(old);
  return structuredClone(seed);
}

function migrate(data) {
  if (data.users && data.memberships) {
    const users = data.users.some((item) => item.email === "admin@klaseph.test")
      ? data.users
      : [structuredClone(seed.users[0]), ...data.users];
    return {
      ...data,
      adminTab: data.adminTab || "directory",
      schools: data.schools?.length ? data.schools : structuredClone(seed.schools),
      adminInvites: data.adminInvites || [],
      auditLogs: data.auditLogs || [],
      settings: {
        ...structuredClone(seed.settings),
        ...(data.settings || {})
      },
      users: users.map((item) => ({ status: "active", ...item })),
      classes: data.classes.map((item) => ({ archivedAt: null, ...item })),
      activities: data.activities.map((item) => ({ archivedAt: null, ...item }))
    };
  }
  const fresh = structuredClone(seed);
  fresh.lang = data.lang || "en";
  return fresh;
}

function persist() {
  if (cloudMode) return;
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

async function loadCloudData(userId) {
  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (profileError) throw profileError;

  const current = mapProfile(profile);
  const classRows = await selectRows("classes", "*");
  const membershipRows = await selectRows("class_members", "*");
  const activityRows = await selectRows("activities", "*");
  const submissionRows = await selectRows("submissions", "*");
  const announcementRows = await selectRows("announcements", "*");
  const profileRows = await selectRows("profiles", "*");
  const schoolRows = await selectOptionalRows("schools", "*");
  const inviteRows = await selectOptionalRows("admin_invites", "*");
  const auditRows = await selectOptionalRows("audit_logs", "*");
  const settingsRows = await selectOptionalRows("system_settings", "*");

  state = {
    ...state,
    users: [
      current,
      ...profileRows.map(mapProfile).filter((item) => item.id !== current.id)
    ],
    currentUserId: current.id,
    classes: classRows.map(mapClass),
    memberships: membershipRows.map(mapMembership),
    activities: activityRows.map(mapActivity),
    submissions: submissionRows.map(mapSubmission),
    announcements: announcementRows.map(mapAnnouncement),
    schools: schoolRows.map(mapSchool),
    adminInvites: inviteRows.map(mapAdminInvite),
    auditLogs: auditRows.map(mapAuditLog),
    settings: settingsRows[0] ? mapSettings(settingsRows[0]) : structuredClone(seed.settings)
  };

  if (!state.users.some((item) => item.id === current.id)) {
    state.users.push(current);
  }
}

async function selectRows(table, columns) {
  const { data, error } = await sb.from(table).select(columns);
  if (error) throw error;
  return data || [];
}

async function selectOptionalRows(table, columns) {
  const { data, error } = await sb.from(table).select(columns);
  if (error) {
    console.warn(`Optional table ${table} unavailable:`, error.message);
    return [];
  }
  return data || [];
}

function mapProfile(row) {
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

function mapSchool(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.school_code || "",
    region: row.region || "",
    division: row.division || "",
    district: row.district || ""
  };
}

function mapAdminInvite(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    schoolId: row.school_id || null,
    school: row.school_name || "",
    acceptedAt: row.accepted_at,
    createdAt: row.created_at
  };
}

function mapAuditLog(row) {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    table: row.table_name,
    recordId: row.record_id,
    createdAt: row.created_at
  };
}

function mapSettings(row) {
  return {
    schoolYear: row.school_year || seed.settings.schoolYear,
    gradingComponents: Array.isArray(row.grading_components) ? row.grading_components : seed.settings.gradingComponents,
    examGeneratorEnabled: row.exam_generator_enabled !== false,
    autoCheckEnabled: row.auto_check_enabled !== false,
    lateSubmissionsEnabled: row.late_submissions_enabled === true
  };
}

function mapClass(row) {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    code: row.join_code,
    teacherId: row.teacher_id,
    schedule: row.schedule || "",
    schoolId: row.school_id || null,
    gradeLevel: row.grade_level || "",
    section: row.section || "",
    schoolYear: row.school_year || "",
    archivedAt: row.archived_at || null
  };
}

function mapMembership(row) {
  return {
    classId: row.class_id,
    userId: row.user_id,
    attendance: row.attendance || "present"
  };
}

function mapActivity(row) {
  return {
    id: row.id,
    classId: row.class_id,
    teacherId: row.teacher_id,
    title: row.title,
    type: row.type,
    mode: row.mode,
    due: row.due_date,
    status: row.status,
    instructions: row.instructions || "",
    standard: row.standard || {},
    questions: row.questions || [],
    archivedAt: row.archived_at || null
  };
}

function mapSubmission(row) {
  return {
    id: row.id,
    activityId: row.activity_id,
    studentId: row.student_id,
    answers: row.answers || {},
    score: row.score,
    maxScore: row.max_score,
    feedback: row.feedback || "",
    checkedAt: row.checked_at
  };
}

function mapAnnouncement(row) {
  return {
    id: row.id,
    classId: row.class_id,
    message: row.message,
    date: row.date
  };
}

function toActivityRow(activity) {
  return {
    id: activity.id,
    class_id: activity.classId,
    teacher_id: activity.teacherId,
    title: activity.title,
    type: activity.type,
    mode: activity.mode,
    due_date: activity.due,
    status: activity.status,
    instructions: activity.instructions,
    standard: activity.standard || {},
    questions: activity.questions || []
  };
}

function toSubmissionRow(submission) {
  return {
    id: submission.id,
    activity_id: submission.activityId,
    student_id: submission.studentId,
    answers: submission.answers || {},
    score: submission.score,
    max_score: submission.maxScore,
    feedback: submission.feedback,
    checked_at: submission.checkedAt
  };
}

function user() {
  return state.users.find((item) => item.id === state.currentUserId);
}

function role() {
  return String(user()?.role || "student").trim();
}

function isAdmin() {
  return role() === "super_admin" || role() === "school_admin";
}

function canTeach() {
  return role() === "teacher" || isAdmin();
}

function t(key) {
  return text[state.lang][key] || key;
}

function teacherClasses() {
  if (isAdmin()) return activeClasses();
  return activeClasses().filter((item) => item.teacherId === user().id);
}

function studentClasses() {
  const ids = state.memberships.filter((item) => item.userId === user().id).map((item) => item.classId);
  return activeClasses().filter((item) => ids.includes(item.id));
}

function myClasses() {
  return canTeach() ? teacherClasses() : studentClasses();
}

function myActivities() {
  const ids = myClasses().map((item) => item.id);
  return state.activities.filter((item) => ids.includes(item.classId) && !item.archivedAt);
}

function activeClasses() {
  return state.classes.filter((item) => !item.archivedAt);
}

function render() {
  if (!user()) {
    app.innerHTML = authScreen();
    bindAuth();
    return;
  }

  const isOnline = navigator.onLine;
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="mark">K</div>
          <div><strong>KlasePH</strong><span>${t("subtitle")}</span></div>
        </div>
        <div class="account-card">
          <b>${esc(user().name)}</b>
          <span>${t(role())} · ${esc(user().school || "School")}</span>
          <span>${esc(user().email || "No email loaded")}</span>
          <span class="mode-badge ${cloudMode ? "cloud" : "local"}">${cloudMode ? "Supabase cloud mode" : "Local demo mode"}</span>
        </div>
        <div class="lang-switch" aria-label="Language">
          <button class="${state.lang === "en" ? "active" : ""}" data-lang="en">EN</button>
          <button class="${state.lang === "fil" ? "active" : ""}" data-lang="fil">FIL</button>
        </div>
        <nav class="nav">
          ${navItems().map((view) => `
            <button class="${state.view === view ? "active" : ""}" data-view="${view}">${t(view)}</button>
          `).join("")}
        </nav>
        <div class="sync-card">
          <b>${t("sync")}</b>
          <span class="small">${t("syncCopy")}</span>
        </div>
      </aside>
      <main class="main">
        <section class="topbar">
          <div>
            <h1>${t("title")}</h1>
            <div class="muted">${esc(user().name)} · ${todayLabel()}</div>
          </div>
          <div class="top-actions">
            <span class="status ${isOnline ? "" : "offline"}">${isOnline ? t("online") : t("offline")}</span>
            ${!cloudMode && role() !== "super_admin" ? `<button class="ghost" id="switchAdminDemo">Admin demo</button>` : ""}
            <button class="ghost" id="signOut">${t("signOut")}</button>
            ${cloudMode ? "" : `<button class="ghost" id="reset">${t("reset")}</button>`}
          </div>
        </section>
        ${route()}
      </main>
    </div>
    <div class="toast" id="toast"></div>
  `;
  bind();
}

function navItems() {
  if (isAdmin()) return ["dashboard", "admin", "users", "classes", "activities", "exams", "records"];
  return canTeach()
    ? ["dashboard", "classes", "activities", "exams", "records", "users"]
    : ["dashboard", "classes", "activities", "exams", "records"];
}

function route() {
  if (state.view === "admin") return adminUsersView();
  if (state.view === "classes") return classesView();
  if (state.view === "activities") return activitiesView();
  if (state.view === "exams") return examsView();
  if (state.view === "records") return recordsView();
  if (state.view === "users") return usersView();
  return dashboardView();
}

function authScreen() {
  const demo = cloudMode ? "" : `
        <div class="demo-logins">
          <button class="quick-login" data-login="admin@klaseph.test">Admin demo</button>
          <button class="quick-login" data-login="teacher@klaseph.test">Teacher demo</button>
          <button class="quick-login" data-login="ana@klaseph.test">Student demo</button>
        </div>`;
  return `
    <main class="auth-wrap">
      <section class="auth-panel">
        <div class="brand">
          <div class="mark">K</div>
          <div><strong>KlasePH</strong><span>${t("subtitle")}</span></div>
        </div>
        <h1>${cloudMode ? "Online classroom accounts" : "Multi-user classroom prototype"}</h1>
        <p>${cloudMode ? "Sign in or create a real Supabase-backed teacher/student account." : "Use the demo accounts or create a local teacher/student account. Configure Supabase to make accounts work across devices."}</p>
        ${demo}
      </section>
      <section class="auth-card">
        <form id="loginForm" class="form-grid">
          <h2 class="full">${t("signIn")}</h2>
          <label class="full">Email<input name="email" type="email" value="${cloudMode ? "" : "teacher@klaseph.test"}" required></label>
          <label class="full">Password<input name="password" type="password" value="${cloudMode ? "" : "teacher123"}" required></label>
          <button class="button full">${t("signIn")}</button>
        </form>
        <form id="signupForm" class="form-grid">
          <h2 class="full">${t("createAccount")}</h2>
          <label>Name<input name="name" required></label>
          <label>Role<select name="role"><option value="teacher">Teacher</option><option value="student">Student</option></select></label>
          <label class="full">Email<input name="email" type="email" required></label>
          <label class="full">Password<input name="password" type="password" minlength="4" required></label>
          <button class="ghost full">${t("createAccount")}</button>
        </form>
      </section>
    </main>
    <div class="toast" id="toast"></div>
  `;
}

function dashboardView() {
  if (isAdmin()) return adminDashboardView();
  const activities = myActivities();
  const autoSubs = state.submissions.filter((s) => s.score !== null && activities.some((a) => a.id === s.activityId));
  const manual = state.submissions.filter((s) => s.score === null && activities.some((a) => a.id === s.activityId));
  const localWarning = cloudMode ? "" : `
      <div class="standard-box">
        <b>Local demo mode</b>
        <span>This browser is not using Supabase yet, so it cannot read your promoted super_admin profile. Fill in config.js and refresh to use cloud roles.</span>
      </div>`;
  return `
    <section class="hero">
      <div>
        <div class="eyebrow">${t(role())}</div>
        <h2>${canTeach() ? t("heroTeacher") : t("heroStudent")}</h2>
        <p>${t("heroCopy")}</p>
        ${localWarning}
      </div>
      <div class="quick-stack">
        ${canTeach() ? quickAction(t("generateExam"), "exams") : quickAction(t("takeExam"), "exams")}
        ${quickAction(canTeach() ? t("addActivity") : "Submit activity", "activities")}
        ${quickAction(canTeach() ? t("addClass") : t("joinClass"), "classes")}
      </div>
    </section>
    <section class="grid">
      ${metric(t("activeClasses"), myClasses().length, "Class sections for this account")}
      ${metric(t("openTasks"), activities.filter((a) => a.status === "Open").length, "Visible activities and exams")}
      ${metric(t("autoChecked"), autoSubs.length, "Objective submissions scored instantly")}
      ${metric(t("toCheck"), manual.length, "Essay or file submissions")}
      <div class="panel span-7">
        <div class="panel-title"><h3>${t("upcoming")}</h3><button class="ghost" data-view="exams">${t("exams")}</button></div>
        <div class="list">${activities.slice(0, 5).map(activityItem).join("") || empty()}</div>
      </div>
      <div class="panel span-5">
        <div class="panel-title"><h3>${t("announcements")}</h3></div>
        <div class="list">${announcementsForMe().map(announcementItem).join("") || empty()}</div>
      </div>
    </section>
  `;
}

function adminDashboardView() {
  const autoSubs = state.submissions.filter((s) => s.score !== null);
  const manual = state.submissions.filter((s) => s.score === null);
  return `
    <section class="hero">
      <div>
        <div class="eyebrow">${t(role())}</div>
        <h2>${t("heroAdmin")}</h2>
        <p>${t("adminCopy")}</p>
      </div>
      <div class="quick-stack">
        ${quickAction("Open admin workspace", "admin")}
        ${quickAction("Manage classes", "admin", "classes")}
        ${quickAction("Manage enrollment", "admin", "enrollment")}
      </div>
    </section>
    <section class="grid">
      ${metric("Total users", state.users.length, "Visible profiles from Supabase")}
      ${metric("Total classes", state.classes.length, "Classes visible to this admin")}
      ${metric(t("autoChecked"), autoSubs.length, "Objective submissions scored instantly")}
      ${metric(t("toCheck"), manual.length, "Manual submissions")}
      <div class="panel span-7">
        <div class="panel-title"><h3>Recent classes</h3><button class="ghost" data-view="classes">${t("classes")}</button></div>
        <div class="list">${state.classes.slice(0, 5).map(classItem).join("") || empty()}</div>
      </div>
      <div class="panel span-5">
        <div class="panel-title"><h3>Admin status</h3></div>
        <div class="standard-box">
          <b>${t(role())}</b>
          <span>Your Supabase profile role is being read as <strong>${esc(role())}</strong>.</span>
        </div>
      </div>
    </section>
  `;
}

function classesView() {
  return `
    <section class="grid">
      <div class="composer span-5">
        <div class="panel-title"><h3>${canTeach() ? t("addClass") : t("joinClass")}</h3></div>
        <form id="classForm" class="form-grid">
          ${canTeach() ? `
            <label>Class name<input name="name" required placeholder="Grade 9 Bonifacio"></label>
            <label>Subject<input name="subject" required placeholder="Mathematics"></label>
            <label>Schedule<input name="schedule" placeholder="Mon/Fri 8:00"></label>
            <label>Join code<input name="code" maxlength="8" placeholder="AUTO"></label>
          ` : `
            <label class="full">Join code<input name="code" required maxlength="8" placeholder="RIZ7"></label>
          `}
          <button class="button full">${t("save")}</button>
        </form>
      </div>
      <div class="panel span-7">
        <div class="panel-title"><h3>${t("classes")}</h3></div>
        <div class="list">${myClasses().map(classItem).join("") || empty()}</div>
      </div>
    </section>
  `;
}

function activitiesView() {
  return `
    <section class="grid">
      <div class="composer span-5">
        <div class="panel-title"><h3>${canTeach() ? t("addActivity") : "Submit activity"}</h3></div>
        ${canTeach() ? activityForm() : submissionForm(false)}
      </div>
      <div class="panel span-7">
        <div class="panel-title"><h3>${t("activities")}</h3></div>
        <div class="list">${myActivities().filter((a) => a.type !== "Exam").map(activityItem).join("") || empty()}</div>
      </div>
    </section>
  `;
}

function examsView() {
  return canTeach() ? `
    <section class="grid">
      <div class="composer span-5">
        <div class="panel-title"><h3>${t("generateExam")}</h3></div>
        ${examGeneratorForm()}
      </div>
      <div class="panel span-7">
        <div class="panel-title"><h3>Auto-check exams</h3></div>
        <div class="list">${myActivities().filter((a) => a.mode === "auto").map(activityItem).join("") || empty()}</div>
      </div>
    </section>
  ` : `
    <section class="grid">
      <div class="composer span-5">
        <div class="panel-title"><h3>${t("takeExam")}</h3></div>
        ${submissionForm(true)}
      </div>
      <div class="panel span-7">
        <div class="panel-title"><h3>Available exams</h3></div>
        <div class="list">${myActivities().filter((a) => a.mode === "auto").map(activityItem).join("") || empty()}</div>
      </div>
    </section>
  `;
}

function recordsView() {
  const activities = myActivities();
  const submissions = canTeach()
    ? state.submissions.filter((s) => activities.some((a) => a.id === s.activityId))
    : state.submissions.filter((s) => s.studentId === user().id);

  return `
    <section class="grid">
      <div class="panel span-4">
        <div class="panel-title"><h3>${t("learnerProgress")}</h3></div>
        <div class="list">${progressItems().join("") || empty()}</div>
      </div>
      <div class="panel span-8">
        <div class="panel-title"><h3>${t("classRecord")}</h3><button class="ghost" id="exportCsv">CSV</button></div>
        <div class="table-wrap">${recordTable(submissions)}</div>
      </div>
    </section>
  `;
}

function usersView() {
  if (isAdmin()) return adminUsersView();
  return `
    <section class="grid">
      <div class="composer span-4">
        <div class="panel-title"><h3>${t("createAccount")}</h3></div>
        ${cloudMode ? `<div class="standard-box"><b>Cloud account creation</b><span>For security, each teacher or student creates their own account from the sign-up screen. This page shows visible class users after they join classes.</span></div>` : `<form id="userForm" class="form-grid">
          <label class="full">Name<input name="name" required></label>
          <label>Role<select name="role"><option value="student">Student</option><option value="teacher">Teacher</option></select></label>
          <label>School<input name="school" value="${esc(user().school || "")}"></label>
          <label class="full">Email<input name="email" type="email" required></label>
          <label class="full">Password<input name="password" type="text" value="student123" required></label>
          <button class="button full">${t("save")}</button>
        </form>`}
      </div>
      <div class="panel span-8">
        <div class="panel-title"><h3>Accounts</h3></div>
        <div class="table-wrap">${usersTable()}</div>
      </div>
    </section>
  `;
}

function adminUsersView() {
  const tab = state.adminTab || "directory";
  return `
    <section class="panel">
      <div class="panel-title">
        <h3>Admin Workspace</h3>
        <button class="ghost" id="refreshCloud">Refresh</button>
      </div>
      <div class="tabs" role="tablist" aria-label="Admin sections">
        ${adminTabButton("directory", "Directory")}
        ${adminTabButton("classes", "Classes")}
        ${adminTabButton("enrollment", "Enrollment")}
        ${adminTabButton("content", "Activities & Exams")}
        ${adminTabButton("records", "Records")}
        ${adminTabButton("schools", "Schools")}
        ${adminTabButton("announcements", "Announcements")}
        ${adminTabButton("settings", "Settings")}
        ${adminTabButton("analytics", "Analytics")}
        ${adminTabButton("invites", "Admin Invites")}
        ${adminTabButton("audit", "Audit Logs")}
        ${adminTabButton("health", "System Health")}
      </div>
    </section>
    ${adminTabContent(tab)}
  `;
}

function adminTabButton(tab, label) {
  return `<button class="${(state.adminTab || "directory") === tab ? "active" : ""}" data-admin-tab="${tab}" role="tab">${esc(label)}</button>`;
}

function adminTabContent(tab) {
  if (tab === "classes") return adminClassesTab();
  if (tab === "enrollment") return adminEnrollmentTab();
  if (tab === "content") return adminContentTab();
  if (tab === "records") return adminRecordsTab();
  if (tab === "schools") return adminSchoolsTab();
  if (tab === "announcements") return adminAnnouncementsTab();
  if (tab === "settings") return adminSettingsTab();
  if (tab === "analytics") return adminAnalyticsTab();
  if (tab === "invites") return adminInvitesTab();
  if (tab === "audit") return adminAuditTab();
  if (tab === "health") return adminHealthTab();
  return adminDirectoryTab();
}

function adminDirectoryTab() {
  return `
    <section class="grid">
      <div class="composer span-4">
        <div class="panel-title"><h3>Create Local Account</h3></div>
        ${cloudMode ? `<div class="standard-box"><b>Cloud auth protected</b><span>Create teacher and student accounts from the sign-up screen, then manage their roles here. Admin invites are available in the Admin Invites tab.</span></div>` : `<form id="adminCreateUserForm" class="form-grid">
          <label class="full">Name<input name="name" required></label>
          <label>Role<select name="role">${roleOptions()}</select></label>
          <label>School<input name="school" value="${esc(user().school || "")}"></label>
          <label class="full">Email<input name="email" type="email" required></label>
          <label class="full">Password<input name="password" type="text" value="student123" required></label>
          <button class="button full">Create account</button>
        </form>`}
      </div>
      <div class="panel span-12">
        <div class="panel-title"><h3>User Directory</h3><span class="muted">${state.users.length} visible accounts</span></div>
        <div class="table-wrap">${adminUsersTable()}</div>
      </div>
    </section>
  `;
}

function adminClassesTab() {
  return `
    <section class="grid">
      <div class="composer span-4">
        <div class="panel-title"><h3>Create Class for Teacher</h3></div>
        <form id="adminClassForm" class="form-grid">
          <label class="full">Class name<input name="name" required placeholder="Grade 9 Bonifacio"></label>
          <label>Teacher<select name="teacherId" required>${teacherOptions()}</select></label>
          <label>Subject<input name="subject" required placeholder="Mathematics"></label>
          <label>Schedule<input name="schedule" placeholder="Mon/Fri 8:00"></label>
          <label>Join code<input name="code" maxlength="8" placeholder="AUTO"></label>
          <label>School<select name="schoolId"><option value="">No school</option>${schoolOptions()}</select></label>
          <label>Grade level<input name="gradeLevel" placeholder="Grade 9"></label>
          <label>Section<input name="section" placeholder="Bonifacio"></label>
          <label class="full">School year<input name="schoolYear" value="${esc(state.settings.schoolYear)}"></label>
          <button class="button full">Create class</button>
        </form>
      </div>
      <div class="panel span-8">
        <div class="panel-title"><h3>Class Management</h3><span class="muted">${activeClasses().length} active classes</span></div>
        <div class="table-wrap">${adminClassesTable()}</div>
      </div>
    </section>
  `;
}

function adminEnrollmentTab() {
  return `
    <section class="grid">
      <div class="composer span-4">
        <div class="panel-title"><h3>Add Student to Class</h3></div>
        <form id="enrollmentForm" class="form-grid">
          <label class="full">Class<select name="classId" required>${classOptions()}</select></label>
          <label class="full">Student<select name="studentId" required>${studentOptions()}</select></label>
          <label>Status<select name="attendance"><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="excused">Excused</option></select></label>
          <button class="button full">Add or update enrollment</button>
        </form>
      </div>
      <div class="panel span-8">
        <div class="panel-title"><h3>Class Members</h3><span class="muted">${state.memberships.length} enrollments</span></div>
        <div class="table-wrap">${adminEnrollmentTable()}</div>
      </div>
    </section>
  `;
}

function adminContentTab() {
  return `
    <section class="grid">
      <div class="composer span-4">
        <div class="panel-title"><h3>Create Activity or Exam</h3></div>
        ${activityForm()}
      </div>
      <div class="panel span-8">
        <div class="panel-title"><h3>Activities and Exams</h3><span class="muted">${state.activities.length} items</span></div>
        <div class="table-wrap">${adminContentTable()}</div>
      </div>
    </section>
  `;
}

function adminRecordsTab() {
  return `
    <section class="grid">
      <div class="panel span-12">
        <div class="panel-title"><h3>All Records</h3><button class="ghost" id="exportCsv">CSV</button></div>
        <div class="table-wrap">${recordTable(state.submissions)}</div>
      </div>
    </section>
  `;
}

function adminAnnouncementsTab() {
  return `
    <section class="grid">
      <div class="composer span-4">
        <div class="panel-title"><h3>Post Announcement</h3></div>
        <form id="announcementForm" class="form-grid">
          <label class="full">Audience<select name="classId"><option value="all">All classes</option>${classOptions()}</select></label>
          <label class="full">Message<textarea name="message" required placeholder="Reminder or school announcement"></textarea></label>
          <label>Date<input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}"></label>
          <button class="button full">Post announcement</button>
        </form>
      </div>
      <div class="panel span-8">
        <div class="panel-title"><h3>Announcements</h3><span class="muted">${state.announcements.length} posts</span></div>
        <div class="table-wrap">${announcementsTable()}</div>
      </div>
    </section>
  `;
}

function adminSettingsTab() {
  return `
    <section class="grid">
      <div class="composer span-5">
        <div class="panel-title"><h3>System Settings</h3></div>
        <form id="settingsForm" class="form-grid">
          <label class="full">Default school year<input name="schoolYear" value="${esc(state.settings.schoolYear)}" required></label>
          <label class="full">Grading components<input name="gradingComponents" value="${esc(state.settings.gradingComponents.join(", "))}" required></label>
          <label class="option full"><input type="checkbox" name="examGeneratorEnabled" ${state.settings.examGeneratorEnabled ? "checked" : ""}><span>Exam generator enabled</span></label>
          <label class="option full"><input type="checkbox" name="autoCheckEnabled" ${state.settings.autoCheckEnabled ? "checked" : ""}><span>Auto-checking enabled</span></label>
          <label class="option full"><input type="checkbox" name="lateSubmissionsEnabled" ${state.settings.lateSubmissionsEnabled ? "checked" : ""}><span>Late submissions enabled</span></label>
          <button class="button full">Save settings</button>
        </form>
      </div>
      <div class="panel span-7">
        <div class="panel-title"><h3>Current Defaults</h3></div>
        <div class="list">
          ${metricMini("School year", state.settings.schoolYear)}
          ${metricMini("Components", state.settings.gradingComponents.join(", "))}
          ${metricMini("Exam generator", state.settings.examGeneratorEnabled ? "On" : "Off")}
          ${metricMini("Auto-check", state.settings.autoCheckEnabled ? "On" : "Off")}
          ${metricMini("Late submissions", state.settings.lateSubmissionsEnabled ? "Allowed" : "Blocked")}
        </div>
      </div>
    </section>
  `;
}

function adminAnalyticsTab() {
  const activeTeachers = state.users.filter((item) => item.role === "teacher" && item.status !== "archived").length;
  const activeStudents = state.users.filter((item) => item.role === "student" && item.status !== "archived").length;
  const pendingManual = state.submissions.filter((item) => item.score === null || item.score === undefined).length;
  const lowScores = state.submissions.filter((item) => Number(item.score || 0) / Math.max(Number(item.maxScore || 1), 1) < 0.75).length;
  return `
    <section class="grid">
      ${metric("Teachers", activeTeachers, "Active teacher accounts")}
      ${metric("Students", activeStudents, "Active learner accounts")}
      ${metric("Pending checks", pendingManual, "Manual submissions")}
      ${metric("Below 75%", lowScores, "Submissions needing support")}
      <div class="panel span-12">
        <div class="panel-title"><h3>Class Activity</h3></div>
        <div class="table-wrap">${analyticsTable()}</div>
      </div>
    </section>
  `;
}

function adminSchoolsTab() {
  return `
    <section class="grid">
      <div class="composer span-4">
        <div class="panel-title"><h3>Create School</h3></div>
        <form id="schoolForm" class="form-grid">
          <label class="full">School name<input name="name" required placeholder="San Isidro National High School"></label>
          <label>Code<input name="school_code" placeholder="SINHS"></label>
          <label>Region<input name="region" placeholder="Region IV-A"></label>
          <label>Division<input name="division" placeholder="Laguna"></label>
          <label class="full">District<input name="district" placeholder="District 1"></label>
          <button class="button full">Create school</button>
        </form>
      </div>
      <div class="panel span-8">
        <div class="panel-title"><h3>Schools</h3><span class="muted">${state.schools.length} schools</span></div>
        <div class="table-wrap">${schoolsTable()}</div>
      </div>
    </section>
  `;
}

function adminInvitesTab() {
  return `
    <section class="grid">
      <div class="composer span-4">
        <div class="panel-title"><h3>Invite Admin</h3></div>
        <form id="adminInviteForm" class="form-grid">
          <label class="full">Email<input name="email" type="email" required placeholder="admin@school.edu.ph"></label>
          <label>Role<select name="role"><option value="school_admin">School Admin</option><option value="super_admin">Super Admin</option></select></label>
          <label>School<select name="school_id"><option value="">No school</option>${schoolOptions()}</select></label>
          <button class="button full">Create invite</button>
        </form>
      </div>
      <div class="panel span-8">
        <div class="panel-title"><h3>Admin Invites</h3><span class="muted">${state.adminInvites.filter((item) => !item.acceptedAt).length} pending</span></div>
        <div class="table-wrap">${adminInvitesTable()}</div>
      </div>
    </section>
  `;
}

function adminAuditTab() {
  return `
    <section class="grid">
      <div class="panel span-12">
        <div class="panel-title"><h3>Audit Logs</h3><span class="muted">Recent admin and system actions</span></div>
        <div class="table-wrap">${auditLogsTable()}</div>
      </div>
    </section>
  `;
}

function adminHealthTab() {
  const suspended = state.users.filter((item) => item.status === "suspended").length;
  const archived = state.users.filter((item) => item.status === "archived").length;
  const admins = state.users.filter((item) => item.role === "super_admin" || item.role === "school_admin").length;
  return `
    <section class="grid">
      ${metric("Users", state.users.length, `${admins} admin account/s`)}
      ${metric("Schools", state.schools.length, "School records available")}
      ${metric("Pending invites", state.adminInvites.filter((item) => !item.acceptedAt).length, "Admin invitations awaiting signup")}
      ${metric("Suspended", suspended, `${archived} archived account/s`)}
      <div class="panel span-12">
        <div class="panel-title"><h3>Setup Status</h3></div>
        <div class="list">
          ${healthItem("Cloud mode", cloudMode ? "Ready" : "Local only", cloudMode)}
          ${healthItem("Schools table", state.schools.length ? "Available" : "No schools loaded", state.schools.length >= 0)}
          ${healthItem("Admin RPCs", cloudMode ? "Configured after admin-dashboard-upgrade.sql" : "Requires Supabase", cloudMode)}
          ${healthItem("Audit logs", state.auditLogs.length ? "Receiving events" : "No events yet", true)}
        </div>
      </div>
    </section>
  `;
}

function healthItem(label, value, good) {
  return `<article class="item"><div class="item-head"><h4>${esc(label)}</h4><span class="chip ${good ? "green" : "gold"}">${esc(value)}</span></div></article>`;
}

function activityForm() {
  return `
    <form id="activityForm" class="form-grid">
      <label class="full">Title<input name="title" required placeholder="Quarter 1 performance task"></label>
      <label>Class<select name="classId">${teacherClasses().map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
      <label>Type<select name="type"><option>Activity</option><option>Assignment</option><option>Quiz</option></select></label>
      <label>Due date<input type="date" name="due" required value="2026-08-22"></label>
      <label>Points<input type="number" name="points" min="1" value="10"></label>
      <label class="full">Instructions<textarea name="instructions" placeholder="What should learners submit?"></textarea></label>
      <button class="button full">${t("save")}</button>
    </form>
  `;
}

function examGeneratorForm() {
  return `
    <form id="examForm" class="form-grid">
      <label class="full">Exam title<input name="title" required placeholder="Quarter 1 Science Check"></label>
      <label>Class<select name="classId">${teacherClasses().map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
      <label>Grade level<select name="grade"><option>Grade 1</option><option>Grade 2</option><option>Grade 3</option><option>Grade 4</option><option>Grade 5</option><option>Grade 6</option><option selected>Grade 7</option><option>Grade 8</option><option>Grade 9</option><option>Grade 10</option><option>Grade 11</option><option>Grade 12</option></select></label>
      <label>Quarter<select name="quarter"><option>Quarter 1</option><option>Quarter 2</option><option>Quarter 3</option><option>Quarter 4</option></select></label>
      <label>Subject<select name="subject"><option>Science</option><option>Mathematics</option><option>Filipino</option><option>English</option><option>Araling Panlipunan</option></select></label>
      <label>Topic<input name="topic" required placeholder="Matter and its properties"></label>
      <label class="full">DepEd learning competency<input name="competency" required placeholder="Paste the exact competency from the MATATAG/K to 12 Curriculum Guide."></label>
      <label class="full">Lesson notes or source text<textarea name="sourceText" required placeholder="Paste the lesson summary, key terms, or reviewer here. The generated questions and answer key will use this content."></textarea></label>
      <label>Assessment component<select name="component"><option>Written Work</option><option>Quarterly Assessment</option><option>Formative Check</option></select></label>
      <label>Items<input type="number" name="items" min="3" max="20" value="10"></label>
      <label>Difficulty balance<select name="difficulty"><option value="balanced" selected>30% easy, 50% average, 20% challenging</option><option value="easy">Mostly easy recall</option><option value="hard">More application items</option></select></label>
      <label>Due date<input type="date" name="due" required value="2026-08-22"></label>
      <label class="full">Question mix<select name="mix"><option value="balanced">Balanced: MCQ, True/False, Identification</option><option value="mcq">Mostly multiple choice</option><option value="identification">Mostly identification</option></select></label>
      <div class="standard-box full">
        <b>DepEd-aligned blueprint</b>
        <span>Generation uses the teacher-provided competency, lesson source text, item type mix, and classroom assessment component. Paste the official competency for closer alignment.</span>
      </div>
      <button class="button full">${t("generateExam")}</button>
    </form>
  `;
}

function submissionForm(examsOnly) {
  const activities = myActivities().filter((item) => examsOnly ? item.mode === "auto" : item.mode !== "auto");
  const selected = activities[0];
  if (!selected) return empty();
  return `
    <form id="submissionForm" class="form-grid">
      <label class="full">Activity<select name="activityId" id="activitySelect">${activities.map((a) => `<option value="${a.id}">${esc(a.title)}</option>`).join("")}</select></label>
      <div class="full" id="answerFields">${answerFields(selected)}</div>
      <button class="button full">${examsOnly ? "Submit for auto-checking" : t("save")}</button>
    </form>
  `;
}

function answerFields(activity) {
  if (activity.mode !== "auto") {
    return `<label>Answer<textarea name="response" required placeholder="Type your answer here."></textarea></label>`;
  }
  return activity.questions.map((q, index) => `
    <fieldset class="question">
      <legend>${index + 1}. ${esc(q.prompt)} <span>${q.points} pt</span></legend>
      ${questionInput(q)}
    </fieldset>
  `).join("");
}

function questionInput(q) {
  if (q.type === "mcq" || q.type === "truefalse") {
    return `<div class="option-list">${q.choices.map((choice) => `
      <label class="option"><input type="radio" name="${q.id}" value="${esc(choice)}" required><span>${esc(choice)}</span></label>
    `).join("")}</div>`;
  }
  return `<input name="${q.id}" required placeholder="Type answer">`;
}

function classItem(item) {
  const members = state.memberships.filter((m) => m.classId === item.id);
  const teacher = state.users.find((u) => u.id === item.teacherId);
  return `
    <article class="item">
      <div class="item-head"><h4>${esc(item.name)}</h4><span class="chip">${esc(item.code)}</span></div>
      <div class="muted">${esc(item.subject)} · ${esc(item.schedule || "No schedule")}</div>
      <div class="chips"><span class="chip green">${members.length} learners</span><span class="chip gold">${esc(teacher?.name || "Teacher")}</span></div>
    </article>
  `;
}

function activityItem(item) {
  const className = state.classes.find((c) => c.id === item.classId)?.name || "Class";
  const submissions = state.submissions.filter((s) => s.activityId === item.id);
  const standard = item.standard ? `${item.standard.grade} · ${item.standard.quarter} · ${item.standard.component}` : "Classroom task";
  return `
    <article class="item">
      <div class="item-head"><h4>${esc(item.title)}</h4><span class="chip ${item.mode === "auto" ? "green" : "gold"}">${item.mode === "auto" ? "Auto-check" : "Manual"}</span></div>
      <div class="muted">${esc(className)} · ${esc(item.type)} · Due ${esc(item.due)}</div>
      <div class="muted">${esc(standard)}</div>
      <div class="chips"><span class="chip">${totalPoints(item)} pts</span><span class="chip green">${submissions.length} submissions</span><span class="chip gold">${item.questions?.length || 1} item/s</span></div>
    </article>
  `;
}

function announcementItem(item) {
  const className = state.classes.find((c) => c.id === item.classId)?.name || "Class";
  return `<article class="item"><h4>${esc(item.message)}</h4><div class="muted">${esc(className)} · ${esc(item.date)}</div></article>`;
}

function progressItems() {
  if (!canTeach()) {
    const submissions = state.submissions.filter((s) => s.studentId === user().id);
    return myActivities().map((a) => {
      const sub = submissions.find((s) => s.activityId === a.id);
      return `<article class="item"><div class="item-head"><h4>${esc(a.title)}</h4><span class="chip ${sub ? "green" : "gold"}">${sub ? "Submitted" : "To do"}</span></div><div class="muted">${sub?.score ?? "-"} / ${totalPoints(a)}</div></article>`;
    });
  }

  const members = state.memberships.filter((m) => teacherClasses().some((c) => c.id === m.classId));
  return members.map((m) => {
    const learner = state.users.find((u) => u.id === m.userId);
    const learnerSubs = state.submissions.filter((s) => s.studentId === m.userId);
    const scored = learnerSubs.filter((s) => s.score !== null);
    const score = scored.length ? Math.round(scored.reduce((sum, s) => sum + (s.score / Math.max(s.maxScore, 1)) * 100, 0) / scored.length) : 0;
    return `<article class="item"><div class="item-head"><h4>${esc(learner?.name || "Learner")}</h4><span class="chip ${m.attendance === "present" ? "green" : "gold"}">${esc(m.attendance)}</span></div><div class="muted">${score}% average across checked work</div></article>`;
  });
}

function recordTable(submissions) {
  const rows = submissions.map((s) => {
    const activity = state.activities.find((a) => a.id === s.activityId);
    const student = state.users.find((u) => u.id === s.studentId);
    return `<tr><td>${esc(student?.name || "Learner")}</td><td>${esc(activity?.title || "Activity")}</td><td>${s.score ?? "For checking"} / ${s.maxScore ?? totalPoints(activity)}</td><td>${esc(s.feedback || "No feedback yet")}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Learner</th><th>Activity</th><th>Score</th><th>Feedback</th></tr></thead><tbody>${rows || `<tr><td colspan="4">${t("noItems")}</td></tr>`}</tbody></table>`;
}

function usersTable() {
  const rows = state.users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${t(u.role)}</td><td>${esc(u.school || "")}</td></tr>`).join("");
  return `<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>School</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function adminClassesTable() {
  const rows = state.classes.map((c) => {
    const teacher = state.users.find((item) => item.id === c.teacherId);
    const memberCount = state.memberships.filter((item) => item.classId === c.id).length;
    return `
      <tr>
        <td><input class="compact-input" data-class-name="${c.id}" value="${esc(c.name)}"></td>
        <td><select class="compact-select" data-class-teacher="${c.id}">${teacherOptions(c.teacherId)}</select></td>
        <td><input class="compact-input" data-class-subject="${c.id}" value="${esc(c.subject)}"></td>
        <td><input class="compact-input" data-class-schedule="${c.id}" value="${esc(c.schedule || "")}"></td>
        <td>${esc(c.code)}</td>
        <td>${memberCount}</td>
        <td><span class="chip ${c.archivedAt ? "gold" : "green"}">${c.archivedAt ? "Archived" : "Active"}</span></td>
        <td><div class="row-actions"><button class="ghost" data-save-class="${c.id}">Save</button><button class="danger" data-archive-class="${c.id}" ${c.archivedAt ? "disabled" : ""}>Archive</button></div></td>
      </tr>
    `;
  }).join("");
  return `<table><thead><tr><th>Class</th><th>Teacher</th><th>Subject</th><th>Schedule</th><th>Code</th><th>Members</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows || `<tr><td colspan="8">${t("noItems")}</td></tr>`}</tbody></table>`;
}

function adminEnrollmentTable() {
  const rows = state.memberships.map((m) => {
    const classItem = state.classes.find((item) => item.id === m.classId);
    const student = state.users.find((item) => item.id === m.userId);
    return `<tr><td>${esc(classItem?.name || "Class")}</td><td>${esc(student?.name || "Student")}</td><td>${esc(student?.email || "")}</td><td><select class="compact-select" data-attendance="${m.classId}:${m.userId}">${["present", "late", "absent", "excused"].map((status) => `<option value="${status}" ${m.attendance === status ? "selected" : ""}>${esc(status)}</option>`).join("")}</select></td><td><div class="row-actions"><button class="ghost" data-save-attendance="${m.classId}:${m.userId}">Save</button><button class="danger" data-remove-member="${m.classId}:${m.userId}">Remove</button></div></td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Class</th><th>Student</th><th>Email</th><th>Attendance</th><th>Actions</th></tr></thead><tbody>${rows || `<tr><td colspan="5">${t("noItems")}</td></tr>`}</tbody></table>`;
}

function adminContentTable() {
  const rows = state.activities.map((a) => {
    const classItem = state.classes.find((item) => item.id === a.classId);
    return `<tr><td>${esc(a.title)}</td><td>${esc(classItem?.name || "Class")}</td><td>${esc(a.type)}</td><td><select class="compact-select" data-activity-status="${a.id}">${["Open", "Closed", "Archived"].map((status) => `<option value="${status}" ${(a.archivedAt ? "Archived" : a.status) === status ? "selected" : ""}>${status}</option>`).join("")}</select></td><td>${esc(a.due || "")}</td><td>${totalPoints(a)}</td><td><div class="row-actions"><button class="ghost" data-save-activity-status="${a.id}">Save</button><button class="danger" data-archive-activity="${a.id}" ${a.archivedAt ? "disabled" : ""}>Archive</button></div></td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Title</th><th>Class</th><th>Type</th><th>Status</th><th>Due</th><th>Points</th><th>Actions</th></tr></thead><tbody>${rows || `<tr><td colspan="7">${t("noItems")}</td></tr>`}</tbody></table>`;
}

function announcementsTable() {
  const rows = state.announcements.map((item) => {
    const classItem = state.classes.find((c) => c.id === item.classId);
    return `<tr><td>${esc(classItem?.name || "All classes")}</td><td>${esc(item.message)}</td><td>${esc(item.date || "")}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Audience</th><th>Message</th><th>Date</th></tr></thead><tbody>${rows || `<tr><td colspan="3">${t("noItems")}</td></tr>`}</tbody></table>`;
}

function analyticsTable() {
  const rows = state.classes.map((c) => {
    const activities = state.activities.filter((item) => item.classId === c.id);
    const submissions = state.submissions.filter((item) => activities.some((activity) => activity.id === item.activityId));
    const average = submissions.length ? Math.round(submissions.reduce((sum, item) => sum + (Number(item.score || 0) / Math.max(Number(item.maxScore || 1), 1)) * 100, 0) / submissions.length) : 0;
    return `<tr><td>${esc(c.name)}</td><td>${esc(state.users.find((item) => item.id === c.teacherId)?.name || "Teacher")}</td><td>${state.memberships.filter((item) => item.classId === c.id).length}</td><td>${activities.length}</td><td>${submissions.length}</td><td>${average || "No scores"}${average ? "%" : ""}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Class</th><th>Teacher</th><th>Students</th><th>Activities</th><th>Submissions</th><th>Average</th></tr></thead><tbody>${rows || `<tr><td colspan="6">${t("noItems")}</td></tr>`}</tbody></table>`;
}

function adminUsersTable() {
  const rows = state.users.map((u) => `
    <tr>
      <td>${esc(u.name)}</td>
      <td>${esc(u.email)}</td>
      <td>
        <select class="compact-select" data-role-user="${u.id}" ${u.id === user().id ? "disabled" : ""}>
          ${["student", "teacher", "school_admin", "super_admin"].map((roleName) => `<option value="${roleName}" ${u.role === roleName ? "selected" : ""}>${esc(t(roleName))}</option>`).join("")}
        </select>
      </td>
      <td>
        <select class="compact-select" data-school-user="${u.id}">
          <option value="">No school</option>
          ${schoolOptions(u.schoolId)}
        </select>
      </td>
      <td><span class="chip ${u.status === "active" ? "green" : "gold"}">${esc(u.status || "active")}</span></td>
      <td>
        <div class="row-actions">
          <button class="ghost" data-save-user="${u.id}">Save</button>
          ${u.status === "suspended" ? `<button class="ghost" data-status-user="${u.id}" data-status="active">Restore</button>` : `<button class="danger" data-status-user="${u.id}" data-status="suspended" ${u.id === user().id ? "disabled" : ""}>Suspend</button>`}
          <button class="danger" data-status-user="${u.id}" data-status="archived" ${u.id === user().id ? "disabled" : ""}>Archive</button>
        </div>
      </td>
    </tr>
  `).join("");
  return `<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>School</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows || `<tr><td colspan="6">${t("noItems")}</td></tr>`}</tbody></table>`;
}

function schoolsTable() {
  const rows = state.schools.map((school) => `<tr><td>${esc(school.name)}</td><td>${esc(school.code)}</td><td>${esc(school.region)}</td><td>${esc(school.division)}</td></tr>`).join("");
  return `<table><thead><tr><th>School</th><th>Code</th><th>Region</th><th>Division</th></tr></thead><tbody>${rows || `<tr><td colspan="4">${t("noItems")}</td></tr>`}</tbody></table>`;
}

function adminInvitesTable() {
  const rows = state.adminInvites.map((invite) => {
    const school = state.schools.find((item) => item.id === invite.schoolId)?.name || invite.school || "No school";
    return `<tr><td>${esc(invite.email)}</td><td>${esc(t(invite.role))}</td><td>${esc(school)}</td><td>${invite.acceptedAt ? "Accepted" : "Pending"}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Email</th><th>Role</th><th>School</th><th>Status</th></tr></thead><tbody>${rows || `<tr><td colspan="4">${t("noItems")}</td></tr>`}</tbody></table>`;
}

function auditLogsTable() {
  const rows = state.auditLogs.slice(0, 20).map((log) => {
    const actor = state.users.find((item) => item.id === log.actorId)?.email || "system";
    return `<tr><td>${esc(log.action)}</td><td>${esc(log.table || "")}</td><td>${esc(actor)}</td><td>${esc(log.createdAt || "")}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Action</th><th>Table</th><th>Actor</th><th>When</th></tr></thead><tbody>${rows || `<tr><td colspan="4">${t("noItems")}</td></tr>`}</tbody></table>`;
}

function schoolOptions(selectedId = "") {
  return state.schools.map((school) => `<option value="${school.id}" ${school.id === selectedId ? "selected" : ""}>${esc(school.name)}</option>`).join("");
}

function teacherOptions(selectedId = "") {
  return state.users
    .filter((item) => item.role === "teacher" || item.role === "school_admin" || item.role === "super_admin")
    .map((teacher) => `<option value="${teacher.id}" ${teacher.id === selectedId ? "selected" : ""}>${esc(teacher.name)}</option>`)
    .join("");
}

function studentOptions(selectedId = "") {
  return state.users
    .filter((item) => item.role === "student")
    .map((student) => `<option value="${student.id}" ${student.id === selectedId ? "selected" : ""}>${esc(student.name)}</option>`)
    .join("");
}

function classOptions(selectedId = "") {
  return activeClasses().map((item) => `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${esc(item.name)}</option>`).join("");
}

function roleOptions(selectedRole = "student") {
  return ["student", "teacher", "school_admin", "super_admin"].map((roleName) => `<option value="${roleName}" ${roleName === selectedRole ? "selected" : ""}>${esc(t(roleName))}</option>`).join("");
}

function metricMini(label, value) {
  return `<div class="item"><div class="item-head"><h4>${esc(label)}</h4><span class="chip">${esc(value)}</span></div></div>`;
}

function bindAuth() {
  document.querySelector("#loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    if (cloudMode) {
      const { data: authData, error } = await sb.auth.signInWithPassword({
        email: data.email,
        password: data.password
      });
      if (error) return toast(error.message);
      await loadCloudData(authData.user.id);
      state.view = "dashboard";
      render();
      return;
    }
    const found = state.users.find((item) => item.email.toLowerCase() === data.email.toLowerCase() && item.password === data.password);
    if (!found) return toast("Account not found. Check email and password.");
    state.currentUserId = found.id;
    state.view = "dashboard";
    persist();
    render();
  });

  document.querySelector("#signupForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    if (cloudMode) {
      const { data: authData, error } = await sb.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.name,
            role: data.role,
            school_name: "Local School"
          }
        }
      });
      if (error) return toast(error.message);
      if (!authData.user || !authData.session) return toast("Check your email to confirm the account, then sign in.");
      await ensureCloudProfile(authData.user.id, data);
      await loadCloudData(authData.user.id);
      state.view = "dashboard";
      render();
      return;
    }
    if (state.users.some((item) => item.email.toLowerCase() === data.email.toLowerCase())) return toast("Email already exists.");
    const account = { id: crypto.randomUUID(), name: data.name, email: data.email, password: data.password, role: data.role, school: "Local School" };
    state.users.push(account);
    state.currentUserId = account.id;
    state.view = "dashboard";
    persist();
    render();
  });

  document.querySelectorAll("[data-login]").forEach((button) => {
    button.addEventListener("click", () => {
      const found = state.users.find((item) => item.email === button.dataset.login);
      state.currentUserId = found.id;
      state.view = "dashboard";
      persist();
      render();
    });
  });
}

async function ensureCloudProfile(id, data) {
  const { error } = await sb.from("profiles").upsert({
    id,
    email: data.email,
    full_name: data.name,
    role: data.role,
    school_name: data.school || "Local School"
  });
  if (error) throw error;
}

function bind() {
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      state.lang = button.dataset.lang;
      persist();
      render();
    });
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.adminJump) state.adminTab = button.dataset.adminJump;
      state.view = button.dataset.view;
      persist();
      render();
    });
  });
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminTab = button.dataset.adminTab;
      persist();
      render();
    });
  });
  document.querySelector("#signOut")?.addEventListener("click", () => {
    if (cloudMode) {
      sb.auth.signOut().finally(() => {
        state.currentUserId = null;
        render();
      });
      return;
    }
    state.currentUserId = null;
    persist();
    render();
  });
  document.querySelector("#switchAdminDemo")?.addEventListener("click", () => {
    const admin = state.users.find((item) => item.email === "admin@klaseph.test");
    if (!admin) return toast("Reset demo data to add the admin account.");
    state.currentUserId = admin.id;
    state.view = "admin";
    state.adminTab = "classes";
    persist();
    render();
  });
  document.querySelector("#reset")?.addEventListener("click", () => {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem("klaseph-hub-state");
    state = structuredClone(seed);
    render();
    toast("Demo data restored.");
  });
  document.querySelector("#classForm")?.addEventListener("submit", saveClass);
  document.querySelector("#activityForm")?.addEventListener("submit", saveActivity);
  document.querySelector("#examForm")?.addEventListener("submit", saveGeneratedExam);
  document.querySelector("#submissionForm")?.addEventListener("submit", saveSubmission);
  document.querySelector("#userForm")?.addEventListener("submit", saveUser);
  document.querySelector("#adminCreateUserForm")?.addEventListener("submit", saveUser);
  document.querySelector("#adminClassForm")?.addEventListener("submit", saveAdminClass);
  document.querySelector("#enrollmentForm")?.addEventListener("submit", saveEnrollment);
  document.querySelector("#announcementForm")?.addEventListener("submit", saveAnnouncement);
  document.querySelector("#settingsForm")?.addEventListener("submit", saveSettings);
  document.querySelector("#schoolForm")?.addEventListener("submit", saveSchool);
  document.querySelector("#adminInviteForm")?.addEventListener("submit", saveAdminInvite);
  document.querySelector("#refreshCloud")?.addEventListener("click", refreshCloudData);
  document.querySelectorAll("[data-save-user]").forEach((button) => {
    button.addEventListener("click", () => saveAdminUser(button.dataset.saveUser));
  });
  document.querySelectorAll("[data-status-user]").forEach((button) => {
    button.addEventListener("click", () => saveAdminUser(button.dataset.statusUser, button.dataset.status));
  });
  document.querySelectorAll("[data-save-class]").forEach((button) => {
    button.addEventListener("click", () => saveAdminClassEdit(button.dataset.saveClass));
  });
  document.querySelectorAll("[data-archive-class]").forEach((button) => {
    button.addEventListener("click", () => archiveAdminClass(button.dataset.archiveClass));
  });
  document.querySelectorAll("[data-save-attendance]").forEach((button) => {
    button.addEventListener("click", () => saveAttendance(button.dataset.saveAttendance));
  });
  document.querySelectorAll("[data-remove-member]").forEach((button) => {
    button.addEventListener("click", () => removeEnrollment(button.dataset.removeMember));
  });
  document.querySelectorAll("[data-save-activity-status]").forEach((button) => {
    button.addEventListener("click", () => saveActivityStatus(button.dataset.saveActivityStatus));
  });
  document.querySelectorAll("[data-archive-activity]").forEach((button) => {
    button.addEventListener("click", () => archiveActivity(button.dataset.archiveActivity));
  });
  document.querySelector("#exportCsv")?.addEventListener("click", exportCsv);
  document.querySelector("#activitySelect")?.addEventListener("change", (event) => {
    const activity = state.activities.find((item) => item.id === event.target.value);
    document.querySelector("#answerFields").innerHTML = answerFields(activity);
  });
}

async function saveClass(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  if (!canTeach()) {
    if (cloudMode) {
      const { error } = await sb.rpc("join_class_by_code", { code_input: data.code });
      if (error) return toast(error.message);
      await loadCloudData(user().id);
      state.view = "classes";
      render();
      return toast("Class joined.");
    }
    const found = state.classes.find((item) => item.code.toLowerCase() === data.code.toLowerCase());
    if (!found) return toast("Class code not found.");
    if (!state.memberships.some((m) => m.classId === found.id && m.userId === user().id)) {
      state.memberships.push({ classId: found.id, userId: user().id, attendance: "present" });
    }
    persist();
    render();
    return toast("Class joined.");
  }

  if (cloudMode) {
    const { error } = await sb.from("classes").insert({
      name: data.name,
      subject: data.subject,
      schedule: data.schedule,
      join_code: uniqueCode(data.code || data.name),
      teacher_id: user().id
    });
    if (error) return toast(error.message);
    await loadCloudData(user().id);
  } else {
    state.classes.unshift({
      id: crypto.randomUUID(),
      name: data.name,
      subject: data.subject,
      code: uniqueCode(data.code || data.name),
      teacherId: user().id,
      schedule: data.schedule
    });
  }
  persist();
  render();
  toast("Class saved.");
}

async function saveActivity(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const classItem = state.classes.find((item) => item.id === data.classId);
  const activity = {
    id: crypto.randomUUID(),
    classId: data.classId,
    teacherId: isAdmin() ? classItem?.teacherId || user().id : user().id,
    title: data.title,
    type: data.type,
    mode: "manual",
    due: data.due,
    status: "Open",
    instructions: data.instructions,
    questions: [{ id: crypto.randomUUID(), type: "essay", prompt: data.instructions || "Submit your answer.", points: Number(data.points || 10), answer: "" }]
  };
  if (cloudMode) {
    const { error } = await sb.from("activities").insert(toActivityRow(activity));
    if (error) return toast(error.message);
    await saveNormalizedExam(activity);
    await loadCloudData(user().id);
  } else {
    state.activities.unshift(activity);
  }
  persist();
  render();
  toast("Activity saved.");
}

async function saveGeneratedExam(event) {
  event.preventDefault();
  if (!state.settings.examGeneratorEnabled) return toast("Exam generator is disabled by admin settings.");
  const data = Object.fromEntries(new FormData(event.target));
  const standard = {
    grade: data.grade,
    quarter: data.quarter,
    subject: data.subject,
    topic: data.topic,
    competency: data.competency,
    component: data.component,
    difficulty: data.difficulty,
    mix: data.mix
  };
  const questions = generateQuestions({
    ...standard,
    sourceText: data.sourceText,
    count: Number(data.items)
  });
  const classItem = state.classes.find((item) => item.id === data.classId);
  const activity = {
    id: crypto.randomUUID(),
    classId: data.classId,
    teacherId: isAdmin() ? classItem?.teacherId || user().id : user().id,
    title: data.title,
    type: "Exam",
    mode: "auto",
    due: data.due,
    status: "Open",
    instructions: buildStandardNote(standard, questions.length),
    standard,
    questions
  };
  if (cloudMode) {
    const { error } = await sb.from("activities").insert(toActivityRow(activity));
    if (error) return toast(error.message);
    await loadCloudData(user().id);
  } else {
    state.activities.unshift(activity);
  }
  persist();
  render();
  toast(`${questions.length} DepEd-aligned auto-check items generated.`);
}

async function saveSubmission(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const activity = state.activities.find((item) => item.id === form.get("activityId"));
  if (!state.settings.lateSubmissionsEnabled && activity?.due && activity.due < new Date().toISOString().slice(0, 10)) {
    return toast("Late submissions are disabled by admin settings.");
  }
  const answers = {};
  activity.questions.forEach((q) => {
    answers[q.id] = form.get(q.id) || form.get("response") || "";
  });
  const checked = activity.mode === "auto" && state.settings.autoCheckEnabled ? checkAnswers(activity, answers) : { score: null, maxScore: totalPoints(activity), feedback: "" };
  const existing = state.submissions.find((s) => s.activityId === activity.id && s.studentId === user().id);
  const submission = {
    id: existing?.id || crypto.randomUUID(),
    activityId: activity.id,
    studentId: user().id,
    answers,
    score: checked.score,
    maxScore: checked.maxScore,
    feedback: checked.feedback,
    checkedAt: activity.mode === "auto" && state.settings.autoCheckEnabled ? new Date().toISOString().slice(0, 10) : null
  };
  if (cloudMode) {
    const { error } = await sb.from("submissions").upsert(toSubmissionRow(submission), {
      onConflict: "activity_id,student_id"
    });
    if (error) return toast(error.message);
    await loadCloudData(user().id);
  } else if (existing) Object.assign(existing, submission);
  else state.submissions.unshift(submission);
  persist();
  render();
  toast(activity.mode === "auto" && state.settings.autoCheckEnabled ? `Auto-checked: ${checked.score}/${checked.maxScore}` : "Submission saved.");
}

function saveUser(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  if (state.users.some((item) => item.email.toLowerCase() === data.email.toLowerCase())) return toast("Email already exists.");
  const account = { id: crypto.randomUUID(), name: data.name, email: data.email, password: data.password, role: data.role, school: data.school, status: "active" };
  state.users.push(account);
  addLocalAudit("create_user", "profiles", account.id, { email: account.email, role: account.role });
  persist();
  render();
  toast("Account created.");
}

async function saveAdminClass(event) {
  event.preventDefault();
  if (!isAdmin()) return toast("Admin access is required.");
  const data = Object.fromEntries(new FormData(event.target));
  const classRecord = {
    id: crypto.randomUUID(),
    name: data.name,
    subject: data.subject,
    code: uniqueCode(data.code || data.name),
    teacherId: data.teacherId,
    schedule: data.schedule,
    schoolId: data.schoolId || null,
    gradeLevel: data.gradeLevel || "",
    section: data.section || "",
    schoolYear: data.schoolYear || state.settings.schoolYear,
    archivedAt: null
  };
  if (cloudMode) {
    const { error } = await sb.from("classes").insert({
      name: classRecord.name,
      subject: classRecord.subject,
      schedule: classRecord.schedule,
      join_code: classRecord.code,
      teacher_id: classRecord.teacherId,
      school_id: classRecord.schoolId,
      grade_level: classRecord.gradeLevel,
      section: classRecord.section,
      school_year: classRecord.schoolYear
    });
    if (error) return toast(error.message);
    await logAdminAction("create_class", "classes", null, classRecord);
    await loadCloudData(user().id);
  } else {
    state.classes.unshift(classRecord);
    addLocalAudit("create_class", "classes", classRecord.id, classRecord);
  }
  persist();
  render();
  toast("Class created.");
}

async function saveAdminClassEdit(classId) {
  const item = state.classes.find((c) => c.id === classId);
  if (!item || !isAdmin()) return toast("Class not found.");
  const patch = {
    name: document.querySelector(`[data-class-name="${classId}"]`)?.value || item.name,
    teacherId: document.querySelector(`[data-class-teacher="${classId}"]`)?.value || item.teacherId,
    subject: document.querySelector(`[data-class-subject="${classId}"]`)?.value || item.subject,
    schedule: document.querySelector(`[data-class-schedule="${classId}"]`)?.value || item.schedule
  };
  if (cloudMode) {
    const { error } = await sb.from("classes").update({
      name: patch.name,
      teacher_id: patch.teacherId,
      subject: patch.subject,
      schedule: patch.schedule,
      updated_at: new Date().toISOString()
    }).eq("id", classId);
    if (error) return toast(error.message);
    await logAdminAction("update_class", "classes", classId, patch);
    await loadCloudData(user().id);
  } else {
    Object.assign(item, patch);
    addLocalAudit("update_class", "classes", classId, patch);
  }
  persist();
  render();
  toast("Class updated.");
}

async function archiveAdminClass(classId) {
  if (!isAdmin()) return toast("Admin access is required.");
  if (!confirm("Archive this class?")) return;
  const archivedAt = new Date().toISOString();
  if (cloudMode) {
    const { error } = await sb.from("classes").update({ archived_at: archivedAt, updated_at: archivedAt }).eq("id", classId);
    if (error) return toast(error.message);
    await logAdminAction("archive_class", "classes", classId, { archived_at: archivedAt });
    await loadCloudData(user().id);
  } else {
    const item = state.classes.find((c) => c.id === classId);
    if (item) item.archivedAt = archivedAt;
    addLocalAudit("archive_class", "classes", classId, { archivedAt });
  }
  persist();
  render();
  toast("Class archived.");
}

async function saveEnrollment(event) {
  event.preventDefault();
  if (!isAdmin()) return toast("Admin access is required.");
  const data = Object.fromEntries(new FormData(event.target));
  const existing = state.memberships.find((item) => item.classId === data.classId && item.userId === data.studentId);
  if (cloudMode) {
    const { error } = await sb.from("class_members").upsert({
      class_id: data.classId,
      user_id: data.studentId,
      attendance: data.attendance
    }, { onConflict: "class_id,user_id" });
    if (error) return toast(error.message);
    await logAdminAction("enroll_student", "class_members", null, data);
    await loadCloudData(user().id);
  } else if (existing) {
    existing.attendance = data.attendance;
    addLocalAudit("update_enrollment", "class_members", null, data);
  } else {
    state.memberships.push({ classId: data.classId, userId: data.studentId, attendance: data.attendance });
    addLocalAudit("enroll_student", "class_members", null, data);
  }
  persist();
  render();
  toast("Enrollment saved.");
}

async function saveAttendance(key) {
  const [classId, userId] = key.split(":");
  const attendance = document.querySelector(`[data-attendance="${key}"]`)?.value || "present";
  if (cloudMode) {
    const { error } = await sb.from("class_members").update({ attendance }).eq("class_id", classId).eq("user_id", userId);
    if (error) return toast(error.message);
    await logAdminAction("update_attendance", "class_members", null, { classId, userId, attendance });
    await loadCloudData(user().id);
  } else {
    const item = state.memberships.find((m) => m.classId === classId && m.userId === userId);
    if (item) item.attendance = attendance;
    addLocalAudit("update_attendance", "class_members", null, { classId, userId, attendance });
  }
  persist();
  render();
  toast("Attendance updated.");
}

async function removeEnrollment(key) {
  const [classId, userId] = key.split(":");
  if (!confirm("Remove this student from the class?")) return;
  if (cloudMode) {
    const { error } = await sb.from("class_members").delete().eq("class_id", classId).eq("user_id", userId);
    if (error) return toast(error.message);
    await logAdminAction("remove_enrollment", "class_members", null, { classId, userId });
    await loadCloudData(user().id);
  } else {
    state.memberships = state.memberships.filter((m) => !(m.classId === classId && m.userId === userId));
    addLocalAudit("remove_enrollment", "class_members", null, { classId, userId });
  }
  persist();
  render();
  toast("Enrollment removed.");
}

async function saveActivityStatus(activityId) {
  const status = document.querySelector(`[data-activity-status="${activityId}"]`)?.value || "Open";
  const archivedAt = status === "Archived" ? new Date().toISOString() : null;
  if (cloudMode) {
    const { error } = await sb.from("activities").update({ status: status === "Archived" ? "Closed" : status, archived_at: archivedAt, updated_at: new Date().toISOString() }).eq("id", activityId);
    if (error) return toast(error.message);
    await logAdminAction("update_activity_status", "activities", activityId, { status, archivedAt });
    await loadCloudData(user().id);
  } else {
    const activity = state.activities.find((item) => item.id === activityId);
    if (activity) {
      activity.status = status === "Archived" ? "Closed" : status;
      activity.archivedAt = archivedAt;
    }
    addLocalAudit("update_activity_status", "activities", activityId, { status, archivedAt });
  }
  persist();
  render();
  toast("Activity updated.");
}

async function archiveActivity(activityId) {
  const select = document.querySelector(`[data-activity-status="${activityId}"]`);
  if (select) select.value = "Archived";
  await saveActivityStatus(activityId);
}

async function saveAnnouncement(event) {
  event.preventDefault();
  if (!isAdmin()) return toast("Admin access is required.");
  const data = Object.fromEntries(new FormData(event.target));
  const targetClasses = data.classId === "all" ? activeClasses() : activeClasses().filter((item) => item.id === data.classId);
  if (!targetClasses.length) return toast("No class audience selected.");
  const records = targetClasses.map((classItem) => ({
    id: crypto.randomUUID(),
    classId: classItem.id,
    message: data.message,
    date: data.date || new Date().toISOString().slice(0, 10)
  }));
  if (cloudMode) {
    const { error } = await sb.from("announcements").insert(records.map((item) => ({
      class_id: item.classId,
      message: item.message,
      date: item.date
    })));
    if (error) return toast(error.message);
    await logAdminAction("post_announcement", "announcements", null, { count: records.length, message: data.message });
    await loadCloudData(user().id);
  } else {
    state.announcements.unshift(...records);
    addLocalAudit("post_announcement", "announcements", null, { count: records.length, message: data.message });
  }
  persist();
  render();
  toast("Announcement posted.");
}

async function saveSettings(event) {
  event.preventDefault();
  if (!isAdmin()) return toast("Admin access is required.");
  const form = new FormData(event.target);
  const settings = {
    schoolYear: form.get("schoolYear"),
    gradingComponents: String(form.get("gradingComponents") || "").split(",").map((item) => item.trim()).filter(Boolean),
    examGeneratorEnabled: form.has("examGeneratorEnabled"),
    autoCheckEnabled: form.has("autoCheckEnabled"),
    lateSubmissionsEnabled: form.has("lateSubmissionsEnabled")
  };
  if (cloudMode) {
    const { error } = await sb.from("system_settings").upsert({
      id: "global",
      school_year: settings.schoolYear,
      grading_components: settings.gradingComponents,
      exam_generator_enabled: settings.examGeneratorEnabled,
      auto_check_enabled: settings.autoCheckEnabled,
      late_submissions_enabled: settings.lateSubmissionsEnabled,
      updated_by: user().id,
      updated_at: new Date().toISOString()
    });
    if (error) return toast(error.message);
    await logAdminAction("update_settings", "system_settings", null, settings);
    await loadCloudData(user().id);
  } else {
    state.settings = settings;
    addLocalAudit("update_settings", "system_settings", null, settings);
  }
  persist();
  render();
  toast("Settings saved.");
}

async function refreshCloudData() {
  if (!cloudMode) return toast("Cloud mode is required.");
  await loadCloudData(user().id);
  render();
  toast("Admin data refreshed.");
}

async function saveSchool(event) {
  event.preventDefault();
  if (!isAdmin()) return toast("Admin access is required.");
  const data = Object.fromEntries(new FormData(event.target));
  if (!cloudMode) {
    const school = {
      id: crypto.randomUUID(),
      name: data.name,
      code: data.school_code || "",
      region: data.region || "",
      division: data.division || "",
      district: data.district || ""
    };
    state.schools.unshift(school);
    addLocalAudit("create_school", "schools", school.id, school);
    persist();
    render();
    return toast("School created.");
  }
  const { error } = await sb.from("schools").insert({
    name: data.name,
    school_code: data.school_code || null,
    region: data.region || null,
    division: data.division || null,
    district: data.district || null,
    created_by: user().id
  });
  if (error) return toast(error.message);
  await logAdminAction("create_school", "schools", null, { name: data.name });
  await refreshCloudData();
}

async function saveAdminInvite(event) {
  event.preventDefault();
  if (role() !== "super_admin") return toast("Only super admin can invite admins.");
  const data = Object.fromEntries(new FormData(event.target));
  const school = state.schools.find((item) => item.id === data.school_id);
  if (!cloudMode) {
    const invite = {
      id: crypto.randomUUID(),
      email: data.email,
      role: data.role,
      schoolId: data.school_id || null,
      school: school?.name || "",
      acceptedAt: null,
      createdAt: new Date().toISOString()
    };
    state.adminInvites.unshift(invite);
    addLocalAudit("admin_create_invite", "admin_invites", invite.id, invite);
    persist();
    render();
    return toast("Admin invite saved.");
  }
  const { error } = await sb.rpc("admin_create_invite", {
    invite_email: data.email,
    invite_role: data.role,
    invite_school_id: data.school_id || null,
    invite_school_name: school?.name || null
  });
  if (error) return toast(error.message);
  await refreshCloudData();
  toast("Admin invite saved.");
}

async function saveAdminUser(targetUserId, forcedStatus = null) {
  if (role() !== "super_admin") return toast("Only super admin can manage users.");
  const target = state.users.find((item) => item.id === targetUserId);
  if (!target) return toast("User not found.");
  const roleSelect = document.querySelector(`[data-role-user="${targetUserId}"]`);
  const schoolSelect = document.querySelector(`[data-school-user="${targetUserId}"]`);
  const nextRole = roleSelect?.value || target.role;
  const nextStatus = forcedStatus || target.status || "active";
  const nextSchool = schoolSelect?.value || null;
  const label = nextStatus === "archived" ? "archive" : nextStatus === "suspended" ? "suspend" : "update";
  if (["suspend", "archive"].includes(label) && !confirm(`Confirm ${label} for ${target.email}?`)) return;
  if (!cloudMode) {
    target.role = nextRole;
    target.status = nextStatus;
    target.schoolId = nextSchool;
    target.school = state.schools.find((item) => item.id === nextSchool)?.name || target.school;
    addLocalAudit("admin_update_profile", "profiles", targetUserId, { role: nextRole, status: nextStatus, schoolId: nextSchool });
    persist();
    render();
    return toast("User updated.");
  }
  const { error } = await sb.rpc("admin_update_profile", {
    target_user_id: targetUserId,
    new_role: nextRole,
    new_status: nextStatus,
    new_school_id: nextSchool
  });
  if (error) return toast(error.message);
  await refreshCloudData();
  toast("User updated.");
}

async function logAdminAction(action, tableName, recordId, afterData) {
  if (!cloudMode) return;
  await sb.rpc("log_audit", {
    action_input: action,
    table_name_input: tableName,
    record_id_input: recordId,
    before_input: null,
    after_input: afterData
  }).catch(() => {});
}

function addLocalAudit(action, tableName, recordId, afterData) {
  if (cloudMode || !isAdmin()) return;
  state.auditLogs.unshift({
    id: crypto.randomUUID(),
    actorId: user().id,
    action,
    table: tableName,
    recordId,
    createdAt: new Date().toISOString(),
    afterData
  });
}

async function saveNormalizedExam(activity) {
  const standard = activity.standard || {};
  try {
    const competencyId = await ensureCompetency(standard, activity.classId);
    const { data: exam, error: examError } = await sb
      .from("exams")
      .insert({
        class_id: activity.classId,
        teacher_id: activity.teacherId,
        competency_id: competencyId,
        title: activity.title,
        assessment_component: standard.component || "Written Work",
        grade_level: standard.grade,
        subject: standard.subject,
        quarter: standard.quarter,
        topic: standard.topic,
        instructions: activity.instructions,
        due_date: activity.due,
        status: "published"
      })
      .select("id")
      .single();

    if (examError) throw examError;

    for (const [index, question] of activity.questions.entries()) {
      const { data: savedQuestion, error: questionError } = await sb
        .from("questions")
        .insert({
          id: question.id,
          exam_id: exam.id,
          competency_id: competencyId,
          item_no: index + 1,
          question_type: question.type,
          difficulty: question.difficulty || "Average",
          prompt: question.prompt,
          answer_key: question.answer || "",
          points: question.points || 1,
          auto_check: question.type !== "essay",
          explanation: question.component || ""
        })
        .select("id")
        .single();

      if (questionError) throw questionError;

      if (Array.isArray(question.choices) && question.choices.length) {
        const choices = question.choices.map((choice, choiceIndex) => ({
          question_id: savedQuestion.id,
          choice_label: String.fromCharCode(65 + choiceIndex),
          choice_text: choice,
          is_correct: normalize(choice) === normalize(question.answer)
        }));
        const { error: choicesError } = await sb.from("question_choices").insert(choices);
        if (choicesError) throw choicesError;
      }
    }
  } catch (error) {
    console.warn("Normalized exam save skipped:", error);
  }
}

async function ensureCompetency(standard, classId) {
  if (!standard?.competency) return null;
  const schoolId = state.classes.find((item) => item.id === classId)?.schoolId || null;
  const record = {
    school_id: schoolId,
    grade_level: standard.grade || "Unspecified",
    subject: standard.subject || "Unspecified",
    quarter: standard.quarter || "Unspecified",
    learning_area: standard.subject || "Unspecified",
    competency_code: null,
    competency_text: standard.competency,
    source: "Teacher provided",
    created_by: user().id
  };
  const { data, error } = await sb
    .from("competencies")
    .insert(record)
    .select("id")
    .single();
  if (error) {
    console.warn("Competency save skipped:", error);
    return null;
  }
  return data.id;
}

function generateQuestions(input) {
  const topic = input.topic.trim();
  const competency = input.competency.trim();
  const sourceText = input.sourceText.trim();
  const keywords = extractKeywords(`${topic} ${competency} ${sourceText}`);
  const sentences = extractSentences(sourceText);
  const typeCycle = input.mix === "mcq" ? ["mcq", "mcq", "truefalse"] : input.mix === "identification" ? ["identification", "mcq", "truefalse"] : ["mcq", "truefalse", "identification"];
  const difficultyCycle = difficultyPlan(input.difficulty, input.count);

  return Array.from({ length: input.count }, (_, index) => {
    const type = typeCycle[index % typeCycle.length];
    const itemDifficulty = difficultyCycle[index];
    const stems = questionStems(input.subject, itemDifficulty);
    const key = keywords[index % keywords.length] || topic;
    const sentence = sentences[index % sentences.length] || `${key} is related to ${topic}.`;
    const distractors = buildDistractors(key, keywords, topic);
    const itemTags = {
      competency,
      component: input.component,
      difficulty: itemDifficulty,
      grade: input.grade,
      quarter: input.quarter,
      subject: input.subject
    };

    if (type === "truefalse") {
      const truthy = index % 2 === 0;
      return {
        id: crypto.randomUUID(),
        type,
        prompt: withCompetencyTag(truthy ? sentenceToStatement(sentence, key) : `${key} is not connected to ${topic}.`, competency, index),
        choices: ["True", "False"],
        answer: truthy ? "True" : "False",
        points: itemDifficulty === "Challenging" ? 2 : 1,
        ...itemTags
      };
    }

    if (type === "identification") {
      return {
        id: crypto.randomUUID(),
        type,
        prompt: withCompetencyTag(`${stems.identification} ${blankKeyword(sentence, key)}`, competency, index),
        answer: key,
        points: itemDifficulty === "Challenging" ? 2 : 1,
        ...itemTags
      };
    }

    return {
      id: crypto.randomUUID(),
      type,
      prompt: withCompetencyTag(`${stems.mcq} ${sentenceToQuestion(sentence, key)}`, competency, index),
      choices: shuffle([key, ...distractors]).slice(0, 4),
      answer: key,
      points: itemDifficulty === "Challenging" ? 2 : 1,
      ...itemTags
    };
  });
}

function difficultyPlan(mode, count) {
  const easyRatio = mode === "easy" ? 0.6 : mode === "hard" ? 0.2 : 0.3;
  const averageRatio = mode === "easy" ? 0.3 : mode === "hard" ? 0.4 : 0.5;
  const easyCount = Math.max(1, Math.round(count * easyRatio));
  const averageCount = Math.max(1, Math.round(count * averageRatio));
  const plan = [
    ...Array(easyCount).fill("Easy"),
    ...Array(averageCount).fill("Average"),
    ...Array(Math.max(0, count - easyCount - averageCount)).fill("Challenging")
  ];
  return plan.slice(0, count);
}

function withCompetencyTag(prompt, competency, index) {
  const shortCompetency = competency.length > 110 ? `${competency.slice(0, 110)}...` : competency;
  return `${prompt} LC: ${shortCompetency}${index > 2 ? ` (Item ${index + 1})` : ""}`;
}

function buildStandardNote(standard, count) {
  return `${standard.component} for ${standard.grade}, ${standard.quarter}, ${standard.subject}. Generated ${count} objective items from teacher-provided competency: ${standard.competency}`;
}

function checkAnswers(activity, answers) {
  let score = 0;
  const maxScore = totalPoints(activity);
  activity.questions.forEach((q) => {
    const expected = normalize(q.answer);
    const actual = normalize(answers[q.id]);
    if (q.type === "identification") {
      if (actual === expected || actual.includes(expected) || expected.includes(actual)) score += q.points;
    } else if (actual === expected) {
      score += q.points;
    }
  });
  return {
    score,
    maxScore,
    feedback: score === maxScore ? "Auto-checked. Perfect score." : "Auto-checked. Review items that did not match the answer key."
  };
}

function extractKeywords(value) {
  const stopWords = new Set([
    "about", "after", "also", "ang", "are", "ating", "between", "can", "for", "from", "has", "have", "into", "its", "learners", "lesson", "mga", "ng", "sa", "should", "that", "the", "their", "this", "through", "understand", "what", "when", "where", "which", "with"
  ]);
  const words = value
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !stopWords.has(word.toLowerCase()));
  return [...new Set(words)].slice(0, 18);
}

function extractSentences(value) {
  return value
    .split(/[.!?\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).length >= 5)
    .slice(0, 12);
}

function questionStems(subject, difficulty) {
  const application = difficulty === "Challenging";
  const recall = difficulty === "Easy";
  const subjectStem = subject === "Filipino" || subject === "Araling Panlipunan"
    ? {
        mcq: application ? "Batay sa sitwasyon, piliin ang pinakaangkop na sagot:" : recall ? "Piliin ang tamang sagot:" : "Batay sa aralin, alin ang tamang sagot?",
        identification: application ? "Tukuyin ang konseptong inilalarawan:" : "Punan ang patlang:"
      }
    : {
        mcq: application ? "Based on the lesson, choose the best applied answer:" : recall ? "Choose the correct answer:" : "Choose the best answer from the lesson:",
        identification: application ? "Identify the concept described:" : "Fill in the blank:"
      };
  return subjectStem;
}

function sentenceToStatement(sentence, key) {
  return sentence.includes(key) ? sentence : `${key} is one of the key ideas in this lesson.`;
}

function sentenceToQuestion(sentence, key) {
  if (sentence.toLowerCase().includes(key.toLowerCase())) {
    return sentence.replace(new RegExp(escapeRegExp(key), "i"), "_____");
  }
  return `Which term is connected to this lesson statement: "${sentence}"?`;
}

function blankKeyword(sentence, key) {
  if (sentence.toLowerCase().includes(key.toLowerCase())) {
    return sentence.replace(new RegExp(escapeRegExp(key), "i"), "_____");
  }
  return `_____ is connected to ${sentence}`;
}

function buildDistractors(answer, keywords, topic) {
  const fallback = ["process", "example", "concept", "evidence", topic].filter((item) => normalize(item) !== normalize(answer));
  return [...keywords, ...fallback]
    .filter((item) => normalize(item) !== normalize(answer))
    .filter((item, index, items) => items.findIndex((other) => normalize(other) === normalize(item)) === index)
    .slice(0, 6);
}

function shuffle(items) {
  return items
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.value);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exportCsv() {
  const activities = myActivities();
  const rows = [["Learner", "Activity", "Type", "Score", "Max Score", "Feedback"]];
  state.submissions
    .filter((s) => !canTeach() ? s.studentId === user().id : activities.some((a) => a.id === s.activityId))
    .forEach((s) => {
      const activity = state.activities.find((a) => a.id === s.activityId);
      const student = state.users.find((u) => u.id === s.studentId);
      rows.push([student?.name || "Learner", activity?.title || "Activity", activity?.type || "", s.score ?? "For checking", s.maxScore ?? totalPoints(activity), s.feedback || ""]);
    });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "klaseph-class-record.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function announcementsForMe() {
  const ids = myClasses().map((item) => item.id);
  return state.announcements.filter((item) => ids.includes(item.classId));
}

function metric(label, value, hint) {
  return `<div class="card span-3 metric"><span>${label}</span><b>${value}</b><span>${hint}</span></div>`;
}

function quickAction(label, view, adminTab = "") {
  return `<button class="quick" data-view="${view}" ${adminTab ? `data-admin-jump="${adminTab}"` : ""}><b>${label}</b><span>Next</span></button>`;
}

function uniqueCode(source) {
  let code = source.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() + Math.floor(Math.random() * 90 + 10);
  while (state.classes.some((item) => item.code === code)) code = code.slice(0, 4) + Math.floor(Math.random() * 90 + 10);
  return code;
}

function totalPoints(activity) {
  if (!activity) return 0;
  return activity.questions?.reduce((sum, q) => sum + Number(q.points || 0), 0) || 0;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function toast(message) {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2200);
}

function empty() {
  return `<div class="empty">${t("noItems")}</div>`;
}

function todayLabel() {
  return new Intl.DateTimeFormat(state.lang === "fil" ? "fil-PH" : "en-PH", {
    weekday: "long",
    month: "short",
    day: "numeric"
  }).format(new Date());
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

window.addEventListener("online", render);
window.addEventListener("offline", render);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
