/* ============================================================
   script.js
   ------------------------------------------------------------
   Wires up the UI: tab switching, form handlers, and all the
   render functions that turn DB data into HTML. This file never
   talks to localStorage directly -- it only calls functions from
   data.js -- and never contains scheduling logic -- that all
   lives in scheduler.js.
   ============================================================ */

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Currently selected sections for the "Generate" tab (checkbox state)
let lastGeneratedSectionIds = [];

/* ============================================================
   TAB NAVIGATION
   ============================================================ */
function switchTab(tabName) {
  document.querySelectorAll(".tab-panel").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((el) => el.classList.remove("active"));

  document.getElementById("tab-" + tabName).classList.add("active");
  document.querySelector(`.nav-btn[data-tab="${tabName}"]`).classList.add("active");

  // Refresh the tab's content every time it's opened, so it always
  // reflects the latest data (e.g. a newly added section shows up
  // immediately in every dropdown).
  refreshTab(tabName);
}

function refreshTab(tabName) {
  if (tabName === "dashboard") renderDashboard();
  if (tabName === "setup") renderSetupTab();
  if (tabName === "subjects") renderSubjectsTab();
  if (tabName === "generate") renderGenerateTab();
  if (tabName === "sectionView") renderSectionViewTab();
  if (tabName === "facultyView") renderFacultyViewTab();
  if (tabName === "roomView") renderRoomViewTab();
  if (tabName === "settings") renderSettingsTab();
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  renderDashboard(); // dashboard is the default active tab
});


/* ============================================================
   HELPER: STATUS MESSAGE
   ============================================================ */
function showMessage(elementId, message, type) {
  const box = document.getElementById(elementId);
  box.textContent = message;
  box.className = "status-message " + type;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

function typeChip(type) {
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return `<span class="chip chip-${type}">${label}</span>`;
}


/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const grid = document.getElementById("statGrid");
  const stats = [
    { label: "Departments", value: DB.departments.length },
    { label: "Sections", value: DB.sections.length },
    { label: "Faculty", value: DB.faculty.length },
    { label: "Rooms", value: DB.rooms.length },
    { label: "Subjects", value: DB.subjects.length },
    { label: "Generated timetables", value: Object.keys(DB.timetables).length }
  ];

  grid.innerHTML = stats
    .map(
      (s) => `
      <div class="stat-card">
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${s.label}</div>
      </div>`
    )
    .join("");

  const listBox = document.getElementById("dashboardTimetableList");
  const entries = Object.keys(DB.timetables);

  if (entries.length === 0) {
    listBox.innerHTML = '<p class="empty-msg">No timetables generated yet. Go to "Generate Timetable" to create one.</p>';
    return;
  }

  listBox.innerHTML = entries
    .map((secId) => {
      const tt = DB.timetables[secId];
      const when = new Date(tt.generatedAt).toLocaleString();
      return `<div class="row"><span>${escapeHtml(sectionLabel(secId))}</span><span>${when}</span></div>`;
    })
    .join("");
}


/* ============================================================
   SETUP TAB — Departments, Sections, Faculty, Rooms
   ============================================================ */
function renderSetupTab() {
  renderDeptList();
  renderSectionList();
  populateFacDeptSelect();
  renderFacultyList();
  renderRoomList();
}

/* ---- Departments ---- */
function handleAddDepartment() {
  const input = document.getElementById("deptNameInput");
  const name = input.value.trim();
  if (name === "") {
    alert("Please enter a department name.");
    return;
  }
  addDepartment(name);
  input.value = "";
  renderDeptList();
  populateFacDeptSelect();
}

function renderDeptList() {
  const list = document.getElementById("deptList");
  if (DB.departments.length === 0) {
    list.innerHTML = '<li class="empty-msg">No departments added yet.</li>';
    return;
  }
  list.innerHTML = DB.departments
    .map(
      (d) => `<li><span>${escapeHtml(d.name)}</span>
        <button class="btn-small" onclick="handleDeleteDepartment('${d.id}')">Delete</button></li>`
    )
    .join("");
}

function handleDeleteDepartment(id) {
  deleteDepartment(id);
  renderDeptList();
  populateFacDeptSelect();
}

/* ---- Sections ---- */
function handleAddSection() {
  const dept = document.getElementById("secDeptInput").value.trim();
  const sem = document.getElementById("secSemInput").value.trim();
  const letter = document.getElementById("secLetterInput").value.trim();

  if (dept === "" || sem === "" || letter === "") {
    alert("Please fill in department code, semester, and section.");
    return;
  }

  const result = addSection(dept.toUpperCase(), sem, letter.toUpperCase());
  if (!result) {
    alert("That section already exists.");
    return;
  }

  document.getElementById("secDeptInput").value = "";
  document.getElementById("secSemInput").value = "";
  document.getElementById("secLetterInput").value = "";

  renderSectionList();
}

function renderSectionList() {
  const list = document.getElementById("sectionList");
  if (DB.sections.length === 0) {
    list.innerHTML = '<li class="empty-msg">No sections added yet.</li>';
    return;
  }
  list.innerHTML = DB.sections
    .map(
      (s) => `<li><span>${escapeHtml(sectionLabel(s.id))}</span>
        <button class="btn-small" onclick="handleDeleteSection('${s.id}')">Delete</button></li>`
    )
    .join("");
}

function handleDeleteSection(id) {
  if (!confirm(`Delete section "${sectionLabel(id)}"? This also removes its subjects and timetable.`)) return;
  deleteSection(id);
  renderSectionList();
}

/* ---- Faculty ---- */
function populateFacDeptSelect() {
  const select = document.getElementById("facDeptSelect");
  if (!select) return;
  select.innerHTML = DB.departments
    .map((d) => `<option value="${d.name}">${escapeHtml(d.name)}</option>`)
    .join("");
}

function handleAddFaculty() {
  const name = document.getElementById("facNameInput").value.trim();
  const dept = document.getElementById("facDeptSelect").value;

  if (name === "") {
    alert("Please enter a faculty name.");
    return;
  }
  if (!dept) {
    alert("Please add a department first.");
    return;
  }

  addFaculty(name, dept);
  document.getElementById("facNameInput").value = "";
  renderFacultyList();
}

function renderFacultyList() {
  const list = document.getElementById("facultyList");
  if (DB.faculty.length === 0) {
    list.innerHTML = '<li class="empty-msg">No faculty added yet.</li>';
    return;
  }
  list.innerHTML = DB.faculty
    .map(
      (f) => `<li><span>${escapeHtml(f.name)} <small style="color:var(--text-muted)">(${escapeHtml(f.department)})</small></span>
        <button class="btn-small" onclick="handleDeleteFaculty('${f.id}')">Delete</button></li>`
    )
    .join("");
}

function handleDeleteFaculty(id) {
  deleteFaculty(id);
  renderFacultyList();
}

/* ---- Rooms ---- */
function handleAddRoom() {
  const number = document.getElementById("roomNumberInput").value.trim();
  const type = document.getElementById("roomTypeSelect").value;
  const capacity = parseInt(document.getElementById("roomCapacityInput").value, 10);

  if (number === "") {
    alert("Please enter a room number.");
    return;
  }
  if (isNaN(capacity) || capacity <= 0) {
    alert("Please enter a valid capacity.");
    return;
  }

  addRoom(number, type, capacity);
  document.getElementById("roomNumberInput").value = "";
  document.getElementById("roomCapacityInput").value = "";
  renderRoomList();
}

function renderRoomList() {
  const list = document.getElementById("roomList");
  if (DB.rooms.length === 0) {
    list.innerHTML = '<li class="empty-msg">No rooms added yet.</li>';
    return;
  }
  list.innerHTML = DB.rooms
    .map(
      (r) => `<li><span>${escapeHtml(r.roomNumber)} <small style="color:var(--text-muted)">(${r.type}, cap. ${r.capacity})</small></span>
        <button class="btn-small" onclick="handleDeleteRoom('${r.id}')">Delete</button></li>`
    )
    .join("");
}

function handleDeleteRoom(id) {
  deleteRoom(id);
  renderRoomList();
}


/* ============================================================
   SUBJECTS TAB
   ============================================================ */
function renderSubjectsTab() {
  populateSectionSelect("subjSectionSelect");
  populateSectionSelect("subjFilterSection", true);
  populateFacultySelect("subjFacultySelect");
  populateRoomSelect("subjRoomSelect");
  renderSubjectTable();
}

function populateSectionSelect(elementId, includeAllOption) {
  const select = document.getElementById(elementId);
  if (!select) return;
  const options = DB.sections.map((s) => `<option value="${s.id}">${escapeHtml(sectionLabel(s.id))}</option>`);
  if (includeAllOption) options.unshift(`<option value="">All sections</option>`);
  select.innerHTML = options.join("") || `<option value="">Add a section first</option>`;
}

function populateFacultySelect(elementId) {
  const select = document.getElementById(elementId);
  if (!select) return;
  select.innerHTML =
    DB.faculty.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("") ||
    `<option value="">Add faculty first</option>`;
}

function populateRoomSelect(elementId) {
  const select = document.getElementById(elementId);
  if (!select) return;
  select.innerHTML =
    DB.rooms.map((r) => `<option value="${r.id}">${escapeHtml(r.roomNumber)} (${r.type})</option>`).join("") ||
    `<option value="">Add a room first</option>`;
}

function handleSubjectTypeChange() {
  const type = document.getElementById("subjTypeSelect").value;
  const durationInput = document.getElementById("subjDurationInput");
  // Labs conventionally run as a 2-period block; default it, but the
  // admin can still override.
  durationInput.value = type === "lab" ? 2 : 1;
}

function handleAddSubject() {
  const sectionId = document.getElementById("subjSectionSelect").value;
  const code = document.getElementById("subjCodeInput").value.trim();
  const name = document.getElementById("subjNameInput").value.trim();
  const type = document.getElementById("subjTypeSelect").value;
  const periods = parseInt(document.getElementById("subjPeriodsInput").value, 10);
  const duration = parseInt(document.getElementById("subjDurationInput").value, 10);
  const facultyId = document.getElementById("subjFacultySelect").value;
  const roomId = document.getElementById("subjRoomSelect").value;

  if (!sectionId) return showMessage("subjectStatus", "Please add and select a section first.", "error");
  if (code === "") return showMessage("subjectStatus", "Please enter a subject code.", "error");
  if (name === "") return showMessage("subjectStatus", "Please enter a subject name.", "error");
  if (isNaN(periods) || periods <= 0) return showMessage("subjectStatus", "Periods per week must be a positive number.", "error");
  if (isNaN(duration) || duration <= 0) return showMessage("subjectStatus", "Block duration must be a positive number.", "error");
  if (duration > periods) return showMessage("subjectStatus", "Block duration cannot be greater than total periods per week.", "error");
  if (periods % duration !== 0) return showMessage("subjectStatus", "Periods per week should be a multiple of block duration (e.g. a 2-period lab block should total 2, 4, 6...).", "error");
  if (!facultyId) return showMessage("subjectStatus", "Please add and select a faculty member first.", "error");
  if (!roomId) return showMessage("subjectStatus", "Please add and select a room first.", "error");

  addSubject(sectionId, code, name, type, periods, duration, facultyId, roomId);

  document.getElementById("subjCodeInput").value = "";
  document.getElementById("subjNameInput").value = "";
  document.getElementById("subjPeriodsInput").value = "";

  showMessage("subjectStatus", `Subject "${name}" added to ${sectionLabel(sectionId)}.`, "success");
  renderSubjectTable();
}

function renderSubjectTable() {
  const filterSelect = document.getElementById("subjFilterSection");
  const filterValue = filterSelect ? filterSelect.value : "";

  const subjects = filterValue ? getSubjectsForSection(filterValue) : DB.subjects;
  const tbody = document.querySelector("#subjectTable tbody");

  if (subjects.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-msg">No subjects found.</td></tr>`;
    return;
  }

  tbody.innerHTML = subjects
    .map((s) => {
      const fac = getFacultyById(s.facultyId);
      const room = getRoomById(s.roomId);
      return `<tr>
        <td>${escapeHtml(s.code)}</td>
        <td>${escapeHtml(s.name)} <br><small style="color:var(--text-muted)">${escapeHtml(sectionLabel(s.sectionId))}</small></td>
        <td>${typeChip(s.type)}</td>
        <td>${s.periodsPerWeek}</td>
        <td>${s.duration}</td>
        <td>${fac ? escapeHtml(fac.name) : "<em>missing</em>"}</td>
        <td>${room ? escapeHtml(room.roomNumber) : "<em>missing</em>"}</td>
        <td><button class="btn-small" onclick="handleDeleteSubject('${s.id}')">Delete</button></td>
      </tr>`;
    })
    .join("");
}

function handleDeleteSubject(id) {
  deleteSubject(id);
  renderSubjectTable();
}

function handleLoadSampleData() {
  if (DB.departments.length > 0 || DB.sections.length > 0) {
    if (!confirm("This will add sample departments, sections, faculty, rooms and subjects alongside your existing data. Continue?")) return;
  }

  const ise = addDepartment("Information Science and Engineering");

  const drAbc = addFaculty("Dr. ABC", ise.name);
  const drXyz = addFaculty("Dr. XYZ", ise.name);
  const drRao = addFaculty("Dr. Rao", ise.name);
  const drAhmed = addFaculty("Dr. Ahmed", ise.name);

  const room204 = addRoom("204", "classroom", 60);
  const room201 = addRoom("201", "classroom", 60);
  const lab1 = addRoom("Programming Lab 1", "lab", 40);

  const secA = addSection("ISE", "3", "A") || getSectionById("ISE-3-A");
  const secB = addSection("ISE", "3", "B") || getSectionById("ISE-3-B");

  addSubject(secA.id, "23ISE301", "Data Structures", "theory", 4, 1, drAbc.id, room204.id);
  addSubject(secA.id, "23ISE302", "DBMS", "theory", 4, 1, drXyz.id, room201.id);
  addSubject(secA.id, "23ISE303", "Mathematics", "theory", 5, 1, drRao.id, room204.id);
  addSubject(secA.id, "23ISE304", "Python Programming Lab", "lab", 2, 2, drXyz.id, lab1.id);
  addSubject(secA.id, "23ISE305", "Computer Networks", "theory", 3, 1, drAhmed.id, room201.id);

  addSubject(secB.id, "23ISE301", "Data Structures", "theory", 4, 1, drAbc.id, room204.id);
  addSubject(secB.id, "23ISE302", "DBMS", "theory", 4, 1, drRao.id, room201.id);
  addSubject(secB.id, "23ISE304", "Python Programming Lab", "lab", 2, 2, drXyz.id, lab1.id);

  showMessage("subjectStatus", "Sample data loaded: 1 department, 2 sections, 4 faculty, 3 rooms, 8 subjects.", "success");
  renderSubjectsTab();
}


/* ============================================================
   GENERATE TAB
   ============================================================ */
function renderGenerateTab() {
  const container = document.getElementById("generateSectionChecklist");

  if (DB.sections.length === 0) {
    container.innerHTML = '<p class="empty-msg">No sections available. Add sections in "University Setup" first.</p>';
    return;
  }

  container.innerHTML = DB.sections
    .map(
      (s) => `<label>
        <input type="checkbox" class="gen-section-checkbox" value="${s.id}" checked />
        ${escapeHtml(sectionLabel(s.id))}
      </label>`
    )
    .join("");

  document.getElementById("generateResultsCard").style.display = "none";
}

function getSelectedSectionIds() {
  return Array.from(document.querySelectorAll(".gen-section-checkbox:checked")).map((cb) => cb.value);
}

function handleGenerate() {
  runGeneration(false);
}

function handleRegenerate() {
  if (lastGeneratedSectionIds.length === 0) {
    showMessage("generateStatus", "Generate a timetable first before regenerating.", "error");
    return;
  }
  runGeneration(true, lastGeneratedSectionIds);
}

function runGeneration(shuffle, forcedSectionIds) {
  const sectionIds = forcedSectionIds || getSelectedSectionIds();

  const errors = validateBeforeGenerate(sectionIds, DB.settings);
  if (errors.length > 0) {
    showMessage("generateStatus", errors.join("\n"), "error");
    document.getElementById("generateResultsCard").style.display = "none";
    return;
  }

  const result = generateSchedule(sectionIds, DB.settings, shuffle);

  // Save each section's grid
  sectionIds.forEach((secId) => {
    saveTimetable(secId, result.grids[secId]);
  });
  lastGeneratedSectionIds = sectionIds;

  if (result.success) {
    showMessage("generateStatus", `Timetable generated successfully for ${sectionIds.length} section(s).`, "success");
  } else {
    const counts = {};
    result.unplaced.forEach((u) => {
      const key = `${u.code} (${sectionLabel(u.sectionId)})`;
      counts[key] = (counts[key] || 0) + 1;
    });
    const details = Object.keys(counts).map((k) => `${k}: ${counts[k]} period(s) unplaced`).join("\n");
    showMessage(
      "generateStatus",
      `Unable to schedule all classes with the current constraints.\n${details}\n` +
      `Try increasing "Max faculty classes per day", adding more working days/periods, or freeing up a shared room.`,
      "warning"
    );
  }

  renderGenerateResults(sectionIds);
}

function renderGenerateResults(sectionIds) {
  const card = document.getElementById("generateResultsCard");
  const box = document.getElementById("generateResults");
  card.style.display = "block";

  box.innerHTML = sectionIds
    .map((secId) => {
      const tt = getTimetable(secId);
      if (!tt) return "";
      return `<h3 style="margin:16px 0 8px;">${escapeHtml(sectionLabel(secId))}</h3>` + buildTimetableHtml(tt.grid, DB.settings);
    })
    .join("");
}


/* ============================================================
   SECTION TIMETABLE VIEW
   ============================================================ */
function renderSectionViewTab() {
  populateSectionSelect("sectionViewSelect");
  renderSectionTimetable();
}

function renderSectionTimetable() {
  const select = document.getElementById("sectionViewSelect");
  const sectionId = select ? select.value : "";
  const output = document.getElementById("sectionTimetableOutput");

  if (!sectionId) {
    output.innerHTML = '<p class="empty-msg">Add a section first.</p>';
    return;
  }

  const tt = getTimetable(sectionId);
  if (!tt) {
    output.innerHTML = '<p class="empty-msg">No timetable generated yet for this section. Go to "Generate Timetable".</p>';
    return;
  }

  output.innerHTML = buildTimetableHtml(tt.grid, DB.settings);
}

function handleDeleteTimetable() {
  const sectionId = document.getElementById("sectionViewSelect").value;
  if (!sectionId) return;
  if (!confirm(`Delete the generated timetable for ${sectionLabel(sectionId)}?`)) return;
  deleteTimetable(sectionId);
  renderSectionTimetable();
}


/* ============================================================
   BUILD TIMETABLE HTML (shared by section/generate views)
   ============================================================ */
function buildTimetableHtml(grid, settings) {
  const dayNames = DAY_NAMES.slice(0, settings.workingDays);
  const periodsPerDay = settings.periodsPerDay;
  const lunchAfter = settings.lunchAfterPeriod || 0;

  let html = '<table class="timetable-grid"><thead><tr><th>Period</th>';
  dayNames.forEach((d) => (html += `<th>${d}</th>`));
  html += "</tr></thead><tbody>";

  for (let period = 0; period < periodsPerDay; period++) {
    html += `<tr><td class="period-col">Period ${period + 1}</td>`;

    for (let day = 0; day < settings.workingDays; day++) {
      const slot = grid[day] ? grid[day][period] : null;
      if (!slot) {
        html += `<td class="free">Free</td>`;
      } else {
        const fac = getFacultyById(slot.facultyId);
        const room = getRoomById(slot.roomId);
        html += `<td class="filled">
          <span class="subj-name">${escapeHtml(slot.name)}</span>
          <span class="subj-code">${escapeHtml(slot.code)}</span>
          <span class="subj-meta">${fac ? escapeHtml(fac.name) : ""} · ${room ? escapeHtml(room.roomNumber) : ""}</span>
        </td>`;
      }
    }
    html += "</tr>";

    if (lunchAfter > 0 && period + 1 === lunchAfter) {
      html += `<tr><td class="lunch-row" colspan="${settings.workingDays + 1}">LUNCH BREAK</td></tr>`;
    }
  }

  html += "</tbody></table>";
  return html;
}


/* ============================================================
   FACULTY TIMETABLE VIEW
   ------------------------------------------------------------
   Scans every saved section timetable and pulls out the periods
   that belong to the selected faculty member.
   ============================================================ */
function renderFacultyViewTab() {
  populateFacultySelect("facultyViewSelect");
  renderFacultyTimetable();
}

function renderFacultyTimetable() {
  const select = document.getElementById("facultyViewSelect");
  const facultyId = select ? select.value : "";
  const output = document.getElementById("facultyTimetableOutput");

  if (!facultyId) {
    output.innerHTML = '<p class="empty-msg">Add faculty first.</p>';
    return;
  }

  const settings = DB.settings;
  const dayNames = DAY_NAMES.slice(0, settings.workingDays);

  // Build a personal grid for this faculty by scanning every timetable
  const personalGrid = Array.from({ length: settings.workingDays }, () =>
    new Array(settings.periodsPerDay).fill(null)
  );

  Object.keys(DB.timetables).forEach((secId) => {
    const grid = DB.timetables[secId].grid;
    for (let day = 0; day < settings.workingDays; day++) {
      for (let period = 0; period < settings.periodsPerDay; period++) {
        const slot = grid[day] ? grid[day][period] : null;
        if (slot && slot.facultyId === facultyId) {
          personalGrid[day][period] = Object.assign({}, slot, { sectionId: secId });
        }
      }
    }
  });

  let html = '<table class="timetable-grid"><thead><tr><th>Period</th>';
  dayNames.forEach((d) => (html += `<th>${d}</th>`));
  html += "</tr></thead><tbody>";

  for (let period = 0; period < settings.periodsPerDay; period++) {
    html += `<tr><td class="period-col">Period ${period + 1}</td>`;
    for (let day = 0; day < settings.workingDays; day++) {
      const slot = personalGrid[day][period];
      if (!slot) {
        html += `<td class="free">Free</td>`;
      } else {
        html += `<td class="filled">
          <span class="subj-name">${escapeHtml(slot.name)}</span>
          <span class="subj-meta">${escapeHtml(sectionLabel(slot.sectionId))}</span>
        </td>`;
      }
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  output.innerHTML = html;
}


/* ============================================================
   ROOM TIMETABLE VIEW
   ============================================================ */
function renderRoomViewTab() {
  populateRoomSelect("roomViewSelect");
  renderRoomTimetable();
}

function renderRoomTimetable() {
  const select = document.getElementById("roomViewSelect");
  const roomId = select ? select.value : "";
  const output = document.getElementById("roomTimetableOutput");

  if (!roomId) {
    output.innerHTML = '<p class="empty-msg">Add a room first.</p>';
    return;
  }

  const settings = DB.settings;
  const dayNames = DAY_NAMES.slice(0, settings.workingDays);

  const roomGrid = Array.from({ length: settings.workingDays }, () =>
    new Array(settings.periodsPerDay).fill(null)
  );

  Object.keys(DB.timetables).forEach((secId) => {
    const grid = DB.timetables[secId].grid;
    for (let day = 0; day < settings.workingDays; day++) {
      for (let period = 0; period < settings.periodsPerDay; period++) {
        const slot = grid[day] ? grid[day][period] : null;
        if (slot && slot.roomId === roomId) {
          roomGrid[day][period] = Object.assign({}, slot, { sectionId: secId });
        }
      }
    }
  });

  let html = '<table class="timetable-grid"><thead><tr><th>Period</th>';
  dayNames.forEach((d) => (html += `<th>${d}</th>`));
  html += "</tr></thead><tbody>";

  for (let period = 0; period < settings.periodsPerDay; period++) {
    html += `<tr><td class="period-col">Period ${period + 1}</td>`;
    for (let day = 0; day < settings.workingDays; day++) {
      const slot = roomGrid[day][period];
      if (!slot) {
        html += `<td class="free">Free</td>`;
      } else {
        html += `<td class="filled">
          <span class="subj-name">${escapeHtml(slot.name)}</span>
          <span class="subj-meta">${escapeHtml(sectionLabel(slot.sectionId))}</span>
        </td>`;
      }
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  output.innerHTML = html;
}


/* ============================================================
   SETTINGS / CONSTRAINTS TAB
   ============================================================ */
function renderSettingsTab() {
  const s = DB.settings;
  document.getElementById("settingWorkingDays").value = s.workingDays;
  document.getElementById("settingPeriodsPerDay").value = s.periodsPerDay;
  document.getElementById("settingStartTime").value = s.startTime;
  document.getElementById("settingPeriodLength").value = s.periodLengthMins;
  document.getElementById("settingLunchAfter").value = s.lunchAfterPeriod;
  document.getElementById("settingMaxFaculty").value = s.maxFacultyPerDay;
}

function handleSaveSettings() {
  const workingDays = parseInt(document.getElementById("settingWorkingDays").value, 10);
  const periodsPerDay = parseInt(document.getElementById("settingPeriodsPerDay").value, 10);
  const startTime = document.getElementById("settingStartTime").value;
  const periodLengthMins = parseInt(document.getElementById("settingPeriodLength").value, 10);
  const lunchAfterPeriod = parseInt(document.getElementById("settingLunchAfter").value, 10);
  const maxFacultyPerDay = parseInt(document.getElementById("settingMaxFaculty").value, 10);

  if (isNaN(periodsPerDay) || periodsPerDay <= 0) {
    return showMessage("settingsStatus", "Periods per day must be a positive number.", "error");
  }
  if (isNaN(maxFacultyPerDay) || maxFacultyPerDay <= 0) {
    return showMessage("settingsStatus", "Max faculty classes per day must be a positive number.", "error");
  }
  if (isNaN(lunchAfterPeriod) || lunchAfterPeriod < 0) {
    return showMessage("settingsStatus", "Lunch break period must be zero or a positive number.", "error");
  }

  updateSettings({
    workingDays,
    periodsPerDay,
    startTime: startTime || "09:00",
    periodLengthMins: isNaN(periodLengthMins) ? 60 : periodLengthMins,
    lunchAfterPeriod,
    maxFacultyPerDay
  });

  showMessage("settingsStatus", "Settings saved. Re-generate timetables for changes to take effect.", "success");
}


/* ============================================================
   RESET ALL DATA
   ============================================================ */
function handleResetAllData() {
  if (!confirm("This will permanently delete ALL departments, sections, faculty, rooms, subjects, and timetables. Continue?")) return;
  resetAllData();
  lastGeneratedSectionIds = [];
  switchTab("dashboard");
}


/* ============================================================
   PRINT
   ============================================================ */
function printCurrentView(containerId) {
  window.print();
}


/* ============================================================
   EXPORT CSV
   ------------------------------------------------------------
   Exports the currently viewed section's timetable as a CSV file
   that opens correctly in Excel/Sheets.
   ============================================================ */
function exportCSV(context) {
  let sectionId = "";
  if (context === "section") {
    sectionId = document.getElementById("sectionViewSelect").value;
  }
  if (!sectionId) {
    alert("Select a section first.");
    return;
  }
  const tt = getTimetable(sectionId);
  if (!tt) {
    alert("No timetable generated for this section yet.");
    return;
  }

  const settings = DB.settings;
  const dayNames = DAY_NAMES.slice(0, settings.workingDays);
  const rows = [["Period", ...dayNames]];

  for (let period = 0; period < settings.periodsPerDay; period++) {
    const row = [`Period ${period + 1}`];
    for (let day = 0; day < settings.workingDays; day++) {
      const slot = tt.grid[day] ? tt.grid[day][period] : null;
      if (!slot) {
        row.push("Free");
      } else {
        const fac = getFacultyById(slot.facultyId);
        const room = getRoomById(slot.roomId);
        row.push(`${slot.name} (${slot.code}) - ${fac ? fac.name : ""} - ${room ? room.roomNumber : ""}`);
      }
    }
    rows.push(row);
  }

  const csvContent = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sectionId}-timetable.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
