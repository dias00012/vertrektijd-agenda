import { PRIORITY_META, STATUS_META } from "./schoolwork";
import type { Exam, Task } from "./types";

/**
 * Zoeken in je schoolwerk.
 *
 * De filters erboven werken met knoppen: status en prioriteit. Dat helpt
 * zolang je weet in welk hokje iets zit, maar niet bij de vraag die je
 * werkelijk stelt -- "waar stond die casus ook alweer", "wat had ik voor
 * bedrijfseconomie". Met een semester aan opdrachten scrol je daar anders aan
 * voorbij.
 *
 * Vandaar: zoeken in alles wat er van een opdracht of toets te lezen valt, de
 * stappen en onderwerpen inbegrepen. Juist die stappen, want daar staat het
 * detail in dat je je herinnert: "Vergane Glorie" is een stap, geen opdracht.
 */

/**
 * Kale vorm om op te vergelijken: kleine letters, zonder accenten, en elk
 * leesteken wordt een spatie.
 *
 * Zo vindt "H8.1" ook "H8.1 t/m 8.4", en hoeft wie "cafe" typt niet te weten
 * dat er een accent in stond. Hetzelfde recept als bij het koppelen van
 * leerblokken aan stappen; dat is geen toeval, het is dezelfde vraag: zijn dit
 * twee namen voor hetzelfde.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Past dit bij waar je naar zoekt?
 *
 * Elk woord uit je zoekopdracht moet ergens voorkomen, maar niet per se in
 * hetzelfde veld: "bedrijfseconomie casus" vindt de opdracht die
 * "Bedrijfseconomie" als vak heeft en "Casus deel 1" in de titel. Op volgorde
 * letten we niet, want die weet je bij zoeken zelden nog.
 *
 * Een lege zoekopdracht past op alles. Dat scheelt de aanroeper een `if`, en
 * dat is precies de `if` die iemand vergeet.
 */
export function matchesSearch(fields: readonly (string | undefined)[], query: string): boolean {
  const woorden = normalize(query).split(" ").filter(Boolean);
  if (woorden.length === 0) return true;

  const hooiberg = fields
    .filter((field): field is string => typeof field === "string" && field.length > 0)
    .map(normalize)
    // Een scheidingsteken ertussen, anders ontstaat er een treffer op de naad
    // van twee velden: vak "Nederlands" plus titel "Opgaven" zou "ndsop"
    // opleveren.
    .join(" | ");

  return woorden.every((woord) => hooiberg.includes(woord));
}

/** Alles wat er van een opdracht te lezen valt, inclusief haar stappen. */
export function taskFields(task: Task): string[] {
  return [
    task.subject,
    task.title,
    task.description ?? "",
    ...(task.steps ?? []).map((step) => step.title),
    PRIORITY_META[task.priority].label,
    STATUS_META[task.status].label,
    task.deadline,
  ];
}

/** Idem voor een toets, met de te leren onderwerpen erbij. */
export function examFields(exam: Exam): string[] {
  return [
    exam.subject,
    exam.title ?? "",
    ...(exam.topics ?? []),
    PRIORITY_META[exam.priority].label,
    STATUS_META[exam.status].label,
    exam.date,
  ];
}
