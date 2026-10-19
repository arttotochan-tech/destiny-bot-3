export interface NamedActivity {
  hash: number;
  name: string;
  description?: string;
  icon?: string;
  modifiers?: string[];
}

export interface NewsItem {
  title: string;
  link: string;
  publishedAt?: string;
  description?: string;
}

export interface WeeklyReport {
  resetId: string;
  startsAt: Date;
  endsAt: Date;
  raids: NamedActivity[];
  dungeons: NamedActivity[];
  nightfalls: NamedActivity[];
  otherHighlights: NamedActivity[];
  news: NewsItem[];
  warnings: string[];
  sourceUrl?: string;
}
