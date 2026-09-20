/**
 * De handelingen die de connector aanbiedt.
 *
 * Dit bestand was duizend regels en deed twee dingen die niets met elkaar te
 * maken hebben: de agenda lezen en de agenda veranderen. Ze staan nu apart; dit
 * is alleen nog de voordeur, zodat niemand zijn imports hoeft aan te passen.
 */
export type {
  AgendaData,
  Duplicate,
  ReadActivity,
  ReadClash,
  ReadDay,
  ReadResult,
  SaveResult,
} from "./agendaTools/types";
export { readAgenda } from "./agendaTools/read";
export {
  deleteActivities,
  moveOccurrence,
  saveActivities,
  skipOccurrence,
  updateSchoolwork,
} from "./agendaTools/write";
