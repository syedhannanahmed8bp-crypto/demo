/* ============================================================
   scheduler.js
   ------------------------------------------------------------
   THE TIMETABLE GENERATION ALGORITHM.

   This is the most important file in the project. It generates
   a conflict-free timetable for EVERY selected section at once,
   because faculty and rooms are shared resources across sections
   — you cannot correctly avoid a faculty clash by generating each
   section's timetable in isolation.

   ------------------------------------------------------------
   HOW IT WORKS (plain language)
   ------------------------------------------------------------
   1. Build one empty weekly grid PER SECTION:
        grid[section][day][period] = null (free) or an occupied slot.

   2. Also track two GLOBAL trackers shared by every section:
        - facultyBusy[day][period] = Set of faculty IDs already
          teaching somebody at that exact day & period.
        - roomBusy[day][period]    = Set of room IDs already in
          use at that exact day & period.
      These are what make cross-section conflict-checking possible:
      even though ISE-3A and ISE-3B have separate grids, they both
      check the SAME facultyBusy/roomBusy trackers before placing
      a class, so Dr. ABC can never end up in two places at once.

   3. Build a single interleaved "request queue" containing every
      period that needs to be scheduled, across ALL subjects in
      ALL selected sections — round-robin style (one period from
      each subject in turn, cycling through sections too). This
      spreads classes across the week instead of clumping, exactly
      like project 1, but now interleaved across sections as well
      so no single section unfairly "grabs" all the good slots
      first.

   4. For each request, scan every (day, period) in order and
      place it in the first slot where ALL of these hold:
        a) the section's own grid is free at that slot
        b) the faculty is free globally at that slot
        c) the room is free globally at that slot
        d) the faculty hasn't hit their max classes for that day
        e) (soft) the subject isn't repeating the previous period
           in that section
        f) if duration > 1 (e.g. a 2-period lab), ALL of the
           consecutive periods needed must individually satisfy
           (a)-(d).

   5. If a request cannot be placed even after relaxing rule (e),
      it is recorded as "unplaced" — this is what "backtracking-lite"
      means here: rather than a full recursive backtracking search
      (which is harder to explain to a beginner), we relax soft
      constraints first and clearly report anything that still
      can't be scheduled, instead of silently producing something
      wrong.

   6. The result is a validated, conflict-free timetable, or a
      clear list of what could not be scheduled and why.
   ============================================================ */


/**
 * Generate timetables for a list of section IDs.
 *
 * @param {string[]} sectionIds - sections to generate for together
 * @param {object} settings - { workingDays, periodsPerDay, maxFacultyPerDay }
 * @param {boolean} shuffleForRegenerate - if true, randomizes subject order
 *                                         (used by the Regenerate button)
 * @returns {object} { grids, unplaced, success }
 *   grids: { [sectionId]: dayByPeriodGrid }
 *   unplaced: [{ sectionId, subjectId, code, name }]
 *   success: true if everything was placed with zero unplaced periods
 */
function generateSchedule(sectionIds, settings, shuffleForRegenerate) {
  const workingDays = settings.workingDays;
  const periodsPerDay = settings.periodsPerDay;
  const maxFacultyPerDay = settings.maxFacultyPerDay;

  // ---- Step 1: empty grid per section ----
  const grids = {};
  sectionIds.forEach((secId) => {
    grids[secId] = Array.from({ length: workingDays }, () =>
      new Array(periodsPerDay).fill(null)
    );
  });

  // ---- Step 2: global trackers ----
  const facultyBusy = Array.from({ length: workingDays }, () =>
    Array.from({ length: periodsPerDay }, () => new Set())
  );
  const roomBusy = Array.from({ length: workingDays }, () =>
    Array.from({ length: periodsPerDay }, () => new Set())
  );
  const facultyDailyCount = Array.from({ length: workingDays }, () => ({}));

  // ---- Step 3: build the interleaved request queue ----
  const queue = buildRequestQueue(sectionIds, shuffleForRegenerate);

  // ---- Step 4-5: place every request ----
  const unplaced = [];

  queue.forEach((request) => {
    let placed = tryPlaceRequest(request, grids, facultyBusy, roomBusy, facultyDailyCount, workingDays, periodsPerDay, maxFacultyPerDay, true);

    if (!placed) {
      // Relax the "no back-to-back repeat" soft rule and retry
      placed = tryPlaceRequest(request, grids, facultyBusy, roomBusy, facultyDailyCount, workingDays, periodsPerDay, maxFacultyPerDay, false);
    }

    if (!placed) {
      unplaced.push(request);
    }
  });

  return {
    grids: grids,
    unplaced: unplaced,
    success: unplaced.length === 0
  };
}


/* ============================================================
   BUILD REQUEST QUEUE
   ------------------------------------------------------------
   Creates one "request" object per period that needs scheduling,
   round-robin across subjects AND across sections, so periods are
   naturally spread out instead of clumping.

   Each request looks like:
   { sectionId, subjectId, code, name, type, facultyId, roomId, duration }
   ============================================================ */
function buildRequestQueue(sectionIds, shuffle) {
  // Build one working list per section: subjects with a "remaining" counter.
  //
  // IMPORTANT: "periodsPerWeek" is the TOTAL number of periods the subject
  // needs across the week (e.g. a lab that meets once for a 2-period block
  // has periodsPerWeek = 2, duration = 2). So the number of separate
  // occurrences to schedule is periodsPerWeek / duration, NOT periodsPerWeek
  // itself -- otherwise a 2-period lab would incorrectly get scheduled as
  // two separate 2-period blocks (4 periods total).
  let perSectionSubjects = {};
  sectionIds.forEach((secId) => {
    let subs = getSubjectsForSection(secId).map((s) => {
      const duration = s.duration || 1;
      const occurrences = Math.max(1, Math.round(s.periodsPerWeek / duration));
      return {
        sectionId: secId,
        subjectId: s.id,
        code: s.code,
        name: s.name,
        type: s.type,
        facultyId: s.facultyId,
        roomId: s.roomId,
        duration: duration,
        remaining: occurrences
      };
    });
    if (shuffle) subs = shuffleArray(subs);
    perSectionSubjects[secId] = subs;
  });

  let sectionOrder = [...sectionIds];
  if (shuffle) sectionOrder = shuffleArray(sectionOrder);

  const queue = [];
  let any = true;
  while (any) {
    any = false;
    sectionOrder.forEach((secId) => {
      perSectionSubjects[secId].forEach((subj) => {
        if (subj.remaining > 0) {
          queue.push({
            sectionId: subj.sectionId,
            subjectId: subj.subjectId,
            code: subj.code,
            name: subj.name,
            type: subj.type,
            facultyId: subj.facultyId,
            roomId: subj.roomId,
            duration: subj.duration
          });
          subj.remaining--;
          if (subj.remaining > 0) any = true;
        }
      });
    });
  }
  return queue;
}


/* ============================================================
   TRY TO PLACE ONE REQUEST
   ------------------------------------------------------------
   Scans every (day, period) in order. For subjects with duration
   > 1 (e.g. a 2-period lab block), checks that every period in the
   block is simultaneously free/valid before committing to any of
   them.
   ============================================================ */
function tryPlaceRequest(
  request,
  grids,
  facultyBusy,
  roomBusy,
  facultyDailyCount,
  workingDays,
  periodsPerDay,
  maxFacultyPerDay,
  avoidBackToBack
) {
  const grid = grids[request.sectionId];
  const duration = request.duration || 1;

  for (let day = 0; day < workingDays; day++) {
    // A multi-period block can't run past the end of the day
    for (let period = 0; period <= periodsPerDay - duration; period++) {
      if (canPlaceBlock(request, grid, facultyBusy, roomBusy, facultyDailyCount, day, period, duration, maxFacultyPerDay, avoidBackToBack)) {
        commitBlock(request, grid, facultyBusy, roomBusy, facultyDailyCount, day, period, duration);
        return true;
      }
    }
  }
  return false;
}

function canPlaceBlock(request, grid, facultyBusy, roomBusy, facultyDailyCount, day, startPeriod, duration, maxFacultyPerDay, avoidBackToBack) {
  // Check the faculty's daily count BEFORE the block (each period in the
  // block counts toward the same day's total, so pre-check headroom)
  const currentCount = facultyDailyCount[day][request.facultyId] || 0;
  if (currentCount + duration > maxFacultyPerDay) return false;

  for (let offset = 0; offset < duration; offset++) {
    const period = startPeriod + offset;

    // (a) section's own slot must be free
    if (grid[day][period] !== null) return false;

    // (b) faculty must be globally free at this exact day/period
    if (facultyBusy[day][period].has(request.facultyId)) return false;

    // (c) room must be globally free at this exact day/period
    if (roomBusy[day][period].has(request.roomId)) return false;
  }

  // (e) soft rule: avoid the same subject as the period immediately
  // before this block starts, within this section
  if (avoidBackToBack && startPeriod > 0) {
    const prev = grid[day][startPeriod - 1];
    if (prev && prev.subjectId === request.subjectId) return false;
  }

  return true;
}

function commitBlock(request, grid, facultyBusy, roomBusy, facultyDailyCount, day, startPeriod, duration) {
  for (let offset = 0; offset < duration; offset++) {
    const period = startPeriod + offset;
    grid[day][period] = {
      subjectId: request.subjectId,
      code: request.code,
      name: request.name,
      type: request.type,
      facultyId: request.facultyId,
      roomId: request.roomId
    };
    facultyBusy[day][period].add(request.facultyId);
    roomBusy[day][period].add(request.roomId);
  }
  facultyDailyCount[day][request.facultyId] =
    (facultyDailyCount[day][request.facultyId] || 0) + duration;
}


/* ============================================================
   VALIDATION BEFORE GENERATING
   ------------------------------------------------------------
   Checks obvious problems up front so the user gets a clear
   message instead of a confusing partial result.
   ============================================================ */
function validateBeforeGenerate(sectionIds, settings) {
  const errors = [];

  if (sectionIds.length === 0) {
    errors.push("Select at least one section to generate a timetable for.");
    return errors;
  }

  const totalSlotsPerSection = settings.workingDays * settings.periodsPerDay;

  sectionIds.forEach((secId) => {
    const subs = getSubjectsForSection(secId);
    if (subs.length === 0) {
      errors.push(`${sectionLabel(secId)} has no subjects added yet.`);
      return;
    }
    const required = subs.reduce((sum, s) => sum + s.periodsPerWeek * (s.duration || 1), 0);
    if (required > totalSlotsPerSection) {
      errors.push(
        `${sectionLabel(secId)}: requires ${required} periods but only ${totalSlotsPerSection} slots are available per week.`
      );
    }
    subs.forEach((s) => {
      if (!s.facultyId || !getFacultyById(s.facultyId)) {
        errors.push(`${sectionLabel(secId)}: subject "${s.name}" has no valid faculty assigned.`);
      }
      if (!s.roomId || !getRoomById(s.roomId)) {
        errors.push(`${sectionLabel(secId)}: subject "${s.name}" has no valid room assigned.`);
      }
    });
  });

  return errors;
}


/* ============================================================
   HELPER: SHUFFLE (Fisher-Yates)
   ============================================================ */
function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
