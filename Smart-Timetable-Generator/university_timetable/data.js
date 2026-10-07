/* ============================================================
   data.js
   ------------------------------------------------------------
   This file defines the DATA MODEL for the whole application
   and handles saving/loading everything to/from localStorage.

   WHY A SEPARATE FILE?
   Keeping the data model separate from the UI code (script.js)
   and the scheduling algorithm (scheduler.js) makes it much
   easier to later swap localStorage for a real database — every
   other file only ever calls the functions in this file, never
   touches localStorage directly.
   ============================================================ */

/* ------------------------------------------------------------
   THE APP STATE
   ------------------------------------------------------------
   Everything the app knows about lives in one object, "DB".
   This is intentionally similar to what a database's tables
   would hold, just represented as plain JS arrays of objects.

   DB.departments   : [{ id, name }]
   DB.faculty       : [{ id, name, department }]
   DB.rooms         : [{ id, roomNumber, type ("classroom"|"lab"), capacity }]
   DB.sections      : [{ id, department, semester, section }]
                        -- e.g. { id:"ISE-3-A", department:"ISE", semester:"3", section:"A" }
   DB.subjects      : [{ id, sectionId, code, name, type ("theory"|"lab"|"tutorial"),
                          periodsPerWeek, duration, facultyId, roomId }]
   DB.settings      : { workingDays, periodsPerDay, startTime, periodLengthMins,
                         lunchAfterPeriod, maxFacultyPerDay }
   DB.timetables    : { [sectionId]: { grid, generatedAt } }
                        -- grid[day][period] = null | { subjectId }
   ------------------------------------------------------------ */

const STORAGE_KEY = "universityTimetableDB_v1";

// Default/empty state used the very first time the app runs.
function createEmptyDB() {
  return {
    departments: [],
    faculty: [],
    rooms: [],
    sections: [],
    subjects: [],
    settings: {
      workingDays: 5,        // 5 or 6
      periodsPerDay: 6,
      startTime: "09:00",
      periodLengthMins: 60,
      lunchAfterPeriod: 3,   // 0 = no lunch break
      maxFacultyPerDay: 4
    },
    timetables: {} // sectionId -> { grid, generatedAt }
  };
}

// The single in-memory copy of everything. Loaded on startup.
let DB = loadDB();

/* ------------------------------------------------------------
   LOAD / SAVE
   ------------------------------------------------------------ */
function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyDB();
    const parsed = JSON.parse(raw);
    // Merge with defaults in case new fields were added since the
    // user's last visit (keeps old saved data forward-compatible).
    const empty = createEmptyDB();
    return {
      departments: parsed.departments || empty.departments,
      faculty: parsed.faculty || empty.faculty,
      rooms: parsed.rooms || empty.rooms,
      sections: parsed.sections || empty.sections,
      subjects: parsed.subjects || empty.subjects,
      settings: Object.assign(empty.settings, parsed.settings || {}),
      timetables: parsed.timetables || empty.timetables
    };
  } catch (err) {
    console.error("Failed to load saved data, starting fresh.", err);
    return createEmptyDB();
  }
}

function saveDB() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
  } catch (err) {
    console.error("Failed to save data to localStorage.", err);
  }
}

/* ------------------------------------------------------------
   ID GENERATION
   ------------------------------------------------------------
   Simple readable IDs like "F1", "R3", "SUB12" instead of long
   random UUIDs, since the whole point is beginner-friendliness.
   ------------------------------------------------------------ */
function nextId(prefix, list) {
  let max = 0;
  list.forEach((item) => {
    const num = parseInt(String(item.id).replace(prefix, ""), 10);
    if (!isNaN(num) && num > max) max = num;
  });
  return prefix + (max + 1);
}

/* ------------------------------------------------------------
   DEPARTMENTS
   ------------------------------------------------------------ */
function addDepartment(name) {
  const dept = { id: nextId("DEPT", DB.departments), name: name };
  DB.departments.push(dept);
  saveDB();
  return dept;
}

function deleteDepartment(id) {
  DB.departments = DB.departments.filter((d) => d.id !== id);
  saveDB();
}

/* ------------------------------------------------------------
   FACULTY
   ------------------------------------------------------------ */
function addFaculty(name, department) {
  const f = { id: nextId("F", DB.faculty), name: name, department: department };
  DB.faculty.push(f);
  saveDB();
  return f;
}

function deleteFaculty(id) {
  DB.faculty = DB.faculty.filter((f) => f.id !== id);
  saveDB();
}

function getFacultyById(id) {
  return DB.faculty.find((f) => f.id === id);
}

/* ------------------------------------------------------------
   ROOMS
   ------------------------------------------------------------ */
function addRoom(roomNumber, type, capacity) {
  const r = { id: nextId("R", DB.rooms), roomNumber: roomNumber, type: type, capacity: capacity };
  DB.rooms.push(r);
  saveDB();
  return r;
}

function deleteRoom(id) {
  DB.rooms = DB.rooms.filter((r) => r.id !== id);
  saveDB();
}

function getRoomById(id) {
  return DB.rooms.find((r) => r.id === id);
}

/* ------------------------------------------------------------
   SECTIONS (Department + Semester + Section letter)
   ------------------------------------------------------------ */
function addSection(department, semester, section) {
  const id = `${department}-${semester}-${section}`;
  // Prevent duplicate sections
  if (DB.sections.some((s) => s.id === id)) {
    return null;
  }
  const sec = { id, department, semester, section };
  DB.sections.push(sec);
  saveDB();
  return sec;
}

function deleteSection(id) {
  DB.sections = DB.sections.filter((s) => s.id !== id);
  // Also remove subjects and timetable belonging to this section
  DB.subjects = DB.subjects.filter((sub) => sub.sectionId !== id);
  delete DB.timetables[id];
  saveDB();
}

function getSectionById(id) {
  return DB.sections.find((s) => s.id === id);
}

function sectionLabel(sectionId) {
  const s = getSectionById(sectionId);
  if (!s) return sectionId;
  return `${s.department} – Sem ${s.semester} – Sec ${s.section}`;
}

/* ------------------------------------------------------------
   SUBJECTS
   ------------------------------------------------------------ */
function addSubject(sectionId, code, name, type, periodsPerWeek, duration, facultyId, roomId) {
  const subj = {
    id: nextId("SUB", DB.subjects),
    sectionId,
    code,
    name,
    type,              // "theory" | "lab" | "tutorial"
    periodsPerWeek,
    duration,          // how many consecutive periods per occurrence (labs often 2)
    facultyId,
    roomId
  };
  DB.subjects.push(subj);
  saveDB();
  return subj;
}

function deleteSubject(id) {
  DB.subjects = DB.subjects.filter((s) => s.id !== id);
  saveDB();
}

function getSubjectsForSection(sectionId) {
  return DB.subjects.filter((s) => s.sectionId === sectionId);
}

function getSubjectById(id) {
  return DB.subjects.find((s) => s.id === id);
}

/* ------------------------------------------------------------
   SETTINGS
   ------------------------------------------------------------ */
function updateSettings(newSettings) {
  DB.settings = Object.assign(DB.settings, newSettings);
  saveDB();
}

/* ------------------------------------------------------------
   TIMETABLES
   ------------------------------------------------------------ */
function saveTimetable(sectionId, grid) {
  DB.timetables[sectionId] = { grid: grid, generatedAt: new Date().toISOString() };
  saveDB();
}

function getTimetable(sectionId) {
  return DB.timetables[sectionId] || null;
}

function deleteTimetable(sectionId) {
  delete DB.timetables[sectionId];
  saveDB();
}

function getAllTimetables() {
  return DB.timetables;
}

/* ------------------------------------------------------------
   RESET EVERYTHING (used by "Clear All Data" in the dashboard)
   ------------------------------------------------------------ */
function resetAllData() {
  DB = createEmptyDB();
  saveDB();
}
