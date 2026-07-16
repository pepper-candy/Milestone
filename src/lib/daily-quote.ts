import quotes from "../../ref/quotes.json";

export type DailyQuote = {
  quote: string;
  author: string;
  theme?: string;
};

const QUOTES = quotes as DailyQuote[];

/** Stable quote-of-day using UTC day number. */
export function getDailyQuote(date = new Date()): DailyQuote {
  if (QUOTES.length === 0) {
    return {
      quote: "Keep going. Small steps still count.",
      author: "Milestone",
      theme: "Perseverance",
    };
  }

  const utcDay = Math.floor(date.getTime() / 86_400_000);
  const index = ((utcDay % QUOTES.length) + QUOTES.length) % QUOTES.length;
  return QUOTES[index]!;
}
