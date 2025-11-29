export type Poll = {
  id: number;
  name: string;
  description: string;
  options: string[];
  startTime: number;
  endTime: number;
  creator: string;
  finalized: boolean;
  resultsPublished: boolean;
  createdAt: number;
  finalizedAt: number;
  publishedAt: number;
  results: number[];
  userHasVoted: boolean;
};

export type PollStatus =
  | 'upcoming'
  | 'active'
  | 'awaitingFinalization'
  | 'finalized'
  | 'published';
