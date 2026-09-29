"use client";

import { useCallback } from "react";
import { useAgenda } from "./useAgenda";
import { doneTarget } from "@/lib/schoolwork";
import type { Activity } from "@/lib/types";

/**
 * Een blok afstrepen, waar je het ook aantikt.
 *
 * Wát er dan afgestreept wordt hangt van het blok af -- een stap, een hele
 * opdracht, een toets, of het blok zelf -- en die keuze staat in `doneTarget`,
 * los van React en dus na te rekenen. Hier blijft alleen het doorgeven over.
 *
 * De dag geef je erbij en de aanroeper haalt hem uit het voorkomen, niet uit de
 * reeks: een herhalend blok streep je af voor vandaag, niet voor elke dinsdag.
 */
export function useDoneToggle(): (activity: Activity, dateKey: string) => void {
  const { tasks, exams, toggleTaskStep, setTaskStatus, setExamStatus, toggleActivityDone } =
    useAgenda();

  return useCallback(
    (activity: Activity, dateKey: string) => {
      const target = doneTarget(activity, dateKey, tasks, exams);
      switch (target.kind) {
        case "step":
          toggleTaskStep(target.taskId, target.stepId);
          return;
        case "task":
          setTaskStatus(target.taskId, target.status);
          return;
        case "exam":
          setExamStatus(target.examId, target.status);
          return;
        case "block":
          toggleActivityDone(activity.id, target.dateKey);
          return;
      }
    },
    [tasks, exams, toggleTaskStep, setTaskStatus, setExamStatus, toggleActivityDone],
  );
}
