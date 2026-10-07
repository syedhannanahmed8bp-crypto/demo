let subjects = [];
function addSubject() {

    let subjectName =
        document.getElementById("subjectName").value.trim();

    let facultyName =
        document.getElementById("facultyName").value.trim();

    let periods =
        parseInt(document.getElementById("periods").value);


    if (
        subjectName === "" ||
        facultyName === "" ||
        isNaN(periods) ||
        periods <= 0
    ) {
        alert("Please enter subject, faculty and periods.");
        return;
    }


    subjects.push({
        name: subjectName,
        faculty: facultyName,
        periods: periods
    });


    displaySubjects();


    document.getElementById("subjectName").value = "";
    document.getElementById("facultyName").value = "";
    document.getElementById("periods").value = "";
}

function displaySubjects() {

    let list =
        document.getElementById("subjectList");

    list.innerHTML = "";


    subjects.forEach(function(subject, index) {

        let li = document.createElement("li");

        li.textContent =
            (index + 1) + ". " +
            subject.name +
            " - " +
            subject.faculty +
            " - " +
            subject.periods +
            " periods/week";

        list.appendChild(li);
    });
}


function generateTimetable() {

    if (subjects.length === 0) {
        alert("Please add at least one subject.");
        return;
    }


    let numberOfDays =
        parseInt(document.getElementById("days").value);

    let periodsPerDay =
        parseInt(document.getElementById("periodsPerDay").value);


    let totalSlots =
        numberOfDays * periodsPerDay;


    let requiredPeriods = 0;


    subjects.forEach(function(subject) {
        requiredPeriods += subject.periods;
    });


    if (requiredPeriods > totalSlots) {

        alert(
            "Not enough timetable slots.\n" +
            "Required: " + requiredPeriods +
            "\nAvailable: " + totalSlots
        );

        return;
    }


    // Create a copy of subjects

    let remainingSubjects =
        subjects.map(function(subject) {

            return {
                name: subject.name,
                faculty: subject.faculty,
                periods: subject.periods
            };

        });


    // Create empty timetable

    let timetable = [];


    for (let day = 0; day < numberOfDays; day++) {

        timetable[day] = [];

        for (
            let period = 0;
            period < periodsPerDay;
            period++
        ) {

            timetable[day][period] = null;

        }
    }


    // Generate timetable

    for (
        let day = 0;
        day < numberOfDays;
        day++
    ) {

        for (
            let period = 0;
            period < periodsPerDay;
            period++
        ) {


            let previousSubject = "";

            if (period > 0 && timetable[day][period - 1]) {

                previousSubject =
                    timetable[day][period - 1].name;

            }


            for (
                let i = 0;
                i < remainingSubjects.length;
                i++
            ) {

                let subject =
                    remainingSubjects[i];


                // Check if subject still needs periods

                if (subject.periods <= 0) {
                    continue;
                }


                // Don't put same subject continuously

                if (subject.name === previousSubject) {
                    continue;
                }


                // Check faculty clash

                let facultyBusy = false;


                for (
                    let p = 0;
                    p < periodsPerDay;
                    p++
                ) {

                    if (timetable[day][p] !== null) {

                        if (
                            timetable[day][p].faculty ===
                            subject.faculty
                        ) {

                            facultyBusy = true;
                            break;

                        }

                    }

                }


                // If faculty already has a class today,
                // skip this subject

                if (facultyBusy) {
                    continue;
                }


                // Assign subject

                timetable[day][period] = {

                    name: subject.name,

                    faculty: subject.faculty

                };


                subject.periods--;

                break;

            }

        }

    }


    displayTimetable(
        timetable,
        numberOfDays,
        periodsPerDay
    );
}

function displayTimetable(
    timetable,
    numberOfDays,
    periodsPerDay
) {

    let days = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
    ];


    let html = "<table>";


    html += "<tr>";

    html += "<th>Period</th>";


    for (
        let day = 0;
        day < numberOfDays;
        day++
    ) {

        html +=
            "<th>" +
            days[day] +
            "</th>";

    }


    html += "</tr>";


    for (
        let period = 0;
        period < periodsPerDay;
        period++
    ) {

        html += "<tr>";


        html +=
            "<td>Period " +
            (period + 1) +
            "</td>";


        for (
            let day = 0;
            day < numberOfDays;
            day++
        ) {

            let slot =
                timetable[day][period];


            if (slot !== null) {

                html +=
                    "<td>" +
                    slot.name +
                    "<br>" +
                    "<small>" +
                    slot.faculty +
                    "</small>" +
                    "</td>";

            } else {

                html += "<td>Free</td>";

            }

        }


        html += "</tr>";

    }


    html += "</table>";


    document.getElementById("timetable").innerHTML =
        html;
}