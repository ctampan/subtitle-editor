export type Segment = {
  start: number;
  end: number;
  text: string;
};

export type MergedSegment = Segment & {
  mergedIndex: number;
  indexOnMerged: number;
  mergedLength: number;
  originalIndex: number;
};

export type TimelineSegment = Segment & {
  isJump: boolean;
};
