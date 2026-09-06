import type { Language } from "./locale";

/**
 * Alle zichtbare teksten van de app.
 *
 * Nederlands is de bron: die staat hier volledig, en Engels moet dezelfde
 * sleutels hebben. Vergeet je er een, dan klaagt de compiler, zodat er nooit
 * een half vertaald scherm ontstaat.
 *
 * Plaatsen als {count} worden ingevuld met `values`.
 */

export type Values = Record<string, string | number>;

export const nl = {
  /* --- Navigatie en frame ---------------------------------------------- */
  "nav.today": "Vandaag",
  "nav.agenda": "Agenda",
  "nav.travel": "Reisplanner",
  "nav.schoolwork": "Schoolwerk",
  "nav.settings": "Instellingen",
  "nav.main": "Hoofdnavigatie",
  "shell.addActivity": "Activiteit toevoegen",
  "shell.add": "Activiteit",
  "shell.tagline": "Weet altijd hoe laat je moet vertrekken.",
  "shell.setHome.title": "Stel je thuislocatie in",
  "shell.setHome.body": "Daarna berekent de app automatisch je vertrektijden.",

  /* --- Algemeen --------------------------------------------------------- */
  "common.cancel": "Annuleren",
  "common.save": "Opslaan",
  "common.add": "Toevoegen",
  "common.delete": "Verwijderen",
  "common.edit": "Bewerken",
  "common.back": "Terug",
  "common.next": "Volgende",
  "common.previous": "Vorige",
  "common.close": "Sluiten",
  "common.skip": "Overslaan",
  "common.loading": "Laden…",
  "common.optional": "optioneel",
  "common.retry": "Opnieuw proberen",
  "common.today": "Vandaag",
  "common.tomorrow": "Morgen",
  "common.yesterday": "Gisteren",

  /* --- Tijd en duur ----------------------------------------------------- */
  "time.minutesShort": "min",
  "time.hoursShort": "u",

  /* --- Weekdagen en maanden --------------------------------------------- */
  "weekday.0": "zondag",
  "weekday.1": "maandag",
  "weekday.2": "dinsdag",
  "weekday.3": "woensdag",
  "weekday.4": "donderdag",
  "weekday.5": "vrijdag",
  "weekday.6": "zaterdag",
  "weekdayShort.0": "zo",
  "weekdayShort.1": "ma",
  "weekdayShort.2": "di",
  "weekdayShort.3": "wo",
  "weekdayShort.4": "do",
  "weekdayShort.5": "vr",
  "weekdayShort.6": "za",
  "month.0": "januari",
  "month.1": "februari",
  "month.2": "maart",
  "month.3": "april",
  "month.4": "mei",
  "month.5": "juni",
  "month.6": "juli",
  "month.7": "augustus",
  "month.8": "september",
  "month.9": "oktober",
  "month.10": "november",
  "month.11": "december",
  "monthShort.0": "jan",
  "monthShort.1": "feb",
  "monthShort.2": "mrt",
  "monthShort.3": "apr",
  "monthShort.4": "mei",
  "monthShort.5": "jun",
  "monthShort.6": "jul",
  "monthShort.7": "aug",
  "monthShort.8": "sep",
  "monthShort.9": "okt",
  "monthShort.10": "nov",
  "monthShort.11": "dec",

  /* --- Herhaling -------------------------------------------------------- */
  "recurrence.none": "Herhaalt niet",
  "recurrence.daily": "Elke dag",
  "recurrence.weekdays": "Elke werkdag",
  "recurrence.every": "Elke {days}",
  "recurrence.range": "Elke {from} t/m {to}",
  "recurrence.until": "{days}, t/m {date}",

  /* --- Activiteitstypes -------------------------------------------------- */
  "category.school": "School",
  "category.werk": "Werk",
  "category.gym": "Gym",
  "category.koken": "Koken",
  "category.hobby": "Hobby",
  "category.school.placeholder": "Wiskunde",
  "category.werk.placeholder": "Werken",
  "category.gym.placeholder": "Leg day",
  "category.koken.placeholder": "Pasta koken",
  "category.hobby.placeholder": "Gamen",

  /* --- Vervoermiddelen --------------------------------------------------- */
  "travelMode.car": "Auto",
  "travelMode.bike": "Fiets",
  "travelMode.transit": "OV",
  "travelMode.walk": "Lopen",
  "travelMode.car.hint": "Snelste route met de auto",
  "travelMode.bike.hint": "Fietsroute",
  "travelMode.transit.hint": "Trein, bus, tram en metro",
  "travelMode.walk.hint": "Wandelroute",
  "leg.walkTo": "Lopen naar {place}",
  "leg.walk": "Lopen",
  "leg.bikeTo": "Fietsen naar {place}",
  "leg.bike": "Fietsen",
  "leg.towards": "{line} richting {headsign}",
  "leg.continue": "Verder reizen",

  /* --- Taalkeuze --------------------------------------------------------- */
  "language.title": "Taal",
  "language.body": "Kies de taal van de app. Je keuze geldt op dit apparaat.",

  /* --- Vandaag en rondleiding -------------------------------------------- */
  "today.title": "Vandaag",
  "today.from": "vanaf {place}",
  "today.loading": "Agenda laden…",
  "today.empty.title": "Nog niets gepland voor vandaag",
  "today.empty.body": "Voeg een activiteit toe en de app rekent meteen uit hoe laat je moet vertrekken.",
  "today.empty.week": "Bekijk de hele week",
  "today.overview": "Dagoverzicht",
  "tour.progress": "Rondleiding · {step} van {total}",
  "tour.closeLabel": "Rondleiding sluiten",
  "tour.label": "Rondleiding: {title}",
  "tour.finish": "Eerste activiteit toevoegen",
  "tour.today.body": "Je startscherm. Bovenaan staat je eerstvolgende activiteit met één groot getal: hoe laat je de deur uit moet. Bij OV zie je daaronder welke trein en bussen je pakt, en of ze op tijd rijden.",
  "tour.agenda.body": "Je planning per dag, week of maand. In het weekraster zie je de reistijd als gestreepte blokken vóór en ná elke activiteit. Zo zie je in één oogopslag hoeveel van je dag onderweg opgaat.",
  "tour.travel.body": "Een losse reisplanner, zoals 9292. Kies van en naar: een station, een adres, je huidige locatie of één tik op Thuis, School of Gym. Je krijgt echte ritten met live vertragingen, spoor en overstappen.",
  "tour.schoolwork.body": "Je opdrachten op deadline en je toetsen op datum, met een kleur voor hoe dringend het is. Per opdracht kun je stappen afvinken, en je ziet hoeveel leertijd je er al voor hebt ingepland.",
  "tour.settings.body": "Je thuislocatie en standaard vervoermiddel, herinneringen vóór vertrek, opgeslagen locaties, en een back-up van alles als één bestand. Ook je account, als je je agenda tussen telefoon en laptop wilt delen.",
} as const;

export type TranslationKey = keyof typeof nl;

export const en: Record<TranslationKey, string> = {
  "nav.today": "Today",
  "nav.agenda": "Calendar",
  "nav.travel": "Journeys",
  "nav.schoolwork": "Schoolwork",
  "nav.settings": "Settings",
  "nav.main": "Main navigation",
  "shell.addActivity": "Add activity",
  "shell.add": "Activity",
  "shell.tagline": "Always know when to leave.",
  "shell.setHome.title": "Set your home location",
  "shell.setHome.body": "After that the app works out your departure times for you.",

  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.add": "Add",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.back": "Back",
  "common.next": "Next",
  "common.previous": "Previous",
  "common.close": "Close",
  "common.skip": "Skip",
  "common.loading": "Loading…",
  "common.optional": "optional",
  "common.retry": "Try again",
  "common.today": "Today",
  "common.tomorrow": "Tomorrow",
  "common.yesterday": "Yesterday",

  "time.minutesShort": "min",
  "time.hoursShort": "h",

  "weekday.0": "Sunday",
  "weekday.1": "Monday",
  "weekday.2": "Tuesday",
  "weekday.3": "Wednesday",
  "weekday.4": "Thursday",
  "weekday.5": "Friday",
  "weekday.6": "Saturday",
  "weekdayShort.0": "Sun",
  "weekdayShort.1": "Mon",
  "weekdayShort.2": "Tue",
  "weekdayShort.3": "Wed",
  "weekdayShort.4": "Thu",
  "weekdayShort.5": "Fri",
  "weekdayShort.6": "Sat",
  "month.0": "January",
  "month.1": "February",
  "month.2": "March",
  "month.3": "April",
  "month.4": "May",
  "month.5": "June",
  "month.6": "July",
  "month.7": "August",
  "month.8": "September",
  "month.9": "October",
  "month.10": "November",
  "month.11": "December",
  "monthShort.0": "Jan",
  "monthShort.1": "Feb",
  "monthShort.2": "Mar",
  "monthShort.3": "Apr",
  "monthShort.4": "May",
  "monthShort.5": "Jun",
  "monthShort.6": "Jul",
  "monthShort.7": "Aug",
  "monthShort.8": "Sep",
  "monthShort.9": "Oct",
  "monthShort.10": "Nov",
  "monthShort.11": "Dec",

  "recurrence.none": "Does not repeat",
  "recurrence.daily": "Every day",
  "recurrence.weekdays": "Every weekday",
  "recurrence.every": "Every {days}",
  "recurrence.range": "Every {from} to {to}",
  "recurrence.until": "{days}, until {date}",

  "category.school": "School",
  "category.werk": "Work",
  "category.gym": "Gym",
  "category.koken": "Cooking",
  "category.hobby": "Hobby",
  "category.school.placeholder": "Maths",
  "category.werk.placeholder": "Work",
  "category.gym.placeholder": "Leg day",
  "category.koken.placeholder": "Cook pasta",
  "category.hobby.placeholder": "Gaming",

  "travelMode.car": "Car",
  "travelMode.bike": "Bike",
  "travelMode.transit": "Transit",
  "travelMode.walk": "Walking",
  "travelMode.car.hint": "Fastest route by car",
  "travelMode.bike.hint": "Cycling route",
  "travelMode.transit.hint": "Train, bus, tram and metro",
  "travelMode.walk.hint": "Walking route",
  "leg.walkTo": "Walk to {place}",
  "leg.walk": "Walk",
  "leg.bikeTo": "Cycle to {place}",
  "leg.bike": "Cycle",
  "leg.towards": "{line} towards {headsign}",
  "leg.continue": "Continue",

  "language.title": "Language",
  "language.body": "Choose the language of the app. Your choice applies on this device.",

  "today.title": "Today",
  "today.from": "from {place}",
  "today.loading": "Loading your calendar…",
  "today.empty.title": "Nothing planned for today yet",
  "today.empty.body": "Add an activity and the app works out when you need to leave.",
  "today.empty.week": "See the whole week",
  "today.overview": "Your day",
  "tour.progress": "Tour · {step} of {total}",
  "tour.closeLabel": "Close tour",
  "tour.label": "Tour: {title}",
  "tour.finish": "Add your first activity",
  "tour.today.body": "Your home screen. At the top is your next activity with one big number: when you need to walk out the door. For public transport it also shows which train and buses to take, and whether they are running on time.",
  "tour.agenda.body": "Your plan by day, week or month. In the week grid, travel time appears as striped blocks before and after each activity, so you can see at a glance how much of your day goes into travelling.",
  "tour.travel.body": "A journey planner in its own right. Pick from and to: a station, an address, your current location, or one tap on Home, School or Gym. You get real departures with live delays, platforms and changes.",
  "tour.schoolwork.body": "Your assignments by deadline and your tests by date, coloured by how urgent they are. You can tick off steps per assignment, and see how much study time you have already planned for it.",
  "tour.settings.body": "Your home location and default way of travelling, reminders before you leave, saved places, and a backup of everything in one file. Your account lives here too, if you want your calendar on both your phone and laptop.",
};

const TABLES: Record<Language, Record<TranslationKey, string>> = { nl, en };

/** Vult {plekken} in met de meegegeven waarden. */
function fill(template: string, values?: Values): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function translate(language: Language, key: TranslationKey, values?: Values): string {
  const table = TABLES[language] ?? nl;
  return fill(table[key] ?? nl[key] ?? key, values);
}
