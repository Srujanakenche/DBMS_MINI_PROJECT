"use client";
import { useState } from "react";
import type { PracticeContent } from "@/lib/practice-content";

export default function LessonPractice({ task }: { task?: PracticeContent }) {
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  if (!task || !Array.isArray(task.options) || !task.question) return null;
  return (
    <section className="lesson-practice">
      <span className="eyebrow">PUT IT INTO PRACTICE</span>
      <h2>Your turn</h2>
      <p>{task.task}</p>
      <label>
        Your working notes
        <textarea
          rows={4}
          placeholder="Write your approach, calculation, or code here…"
        />
      </label>
      <fieldset>
        <legend>{task.question}</legend>
        {task.options.map((option, index) => (
          <label className="quiz-option" key={option}>
            <input
              type="radio"
              name="practice-answer"
              checked={choice === index}
              onChange={() => {
                setChoice(index);
                setChecked(false);
              }}
            />
            {option}
          </label>
        ))}
      </fieldset>
      <button disabled={choice === null} onClick={() => setChecked(true)}>
        Check my answer
      </button>
      {checked && (
        <div role="status" className="practice-feedback">
          <strong>
            {choice === task.answer ? task.correctFeedback : task.retryFeedback}
          </strong>
          <p>{task.explanation}</p>
        </div>
      )}
      <small>
        This practice check is for learning. Working notes stay on this screen
        and aren’t submitted or graded.
      </small>
    </section>
  );
}
