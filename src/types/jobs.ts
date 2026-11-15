export type JobStatus = "queued" | "running" | "done" | "failed";

export type JobStage =
  | "queued"
  | "validating"
  | "fetching_metadata"
  | "downloading"
  | "extracting"
  | "creating_pdf"
  | "done"
  | "failed";

export type JobLogLevel = "info" | "warn" | "error" | "debug";

export type JobLogEntry = {
  time: string;
  level: JobLogLevel;
  message: string;
};

export type JobRequest = {
  url: string;
  interval: number;
  start?: number;
  end?: number;
  format: "jpg" | "png";
  quality?: "1080p" | "720p" | "480p";
  contactSheet?: boolean;
};

export type JobMetadata = {
  title: string;
  duration?: number;
  thumbnail?: string;
};

export type SnapshotFile = {
  filename: string;
  timestamp: number;
};

export type JobOutput = {
  imageCount: number;
  pdfFilename?: string;
  snapshots?: SnapshotFile[];
  contactSheet?: SnapshotFile;
};

export type JobRecord = {
  id: string;
  createdAt: string;
  status: JobStatus;
  stage: JobStage;
  progress: number;
  error?: string;
  warnings?: string[];
  logs?: JobLogEntry[];
  request: JobRequest;
  metadata?: JobMetadata;
  output?: JobOutput;
};

export type SnapshotPublic = SnapshotFile & {
  url: string;
};

export type JobPublic = Omit<JobRecord, "output"> & {
  output?: {
    imageCount: number;
    pdfFilename?: string;
    pdfUrl?: string;
    snapshots?: SnapshotPublic[];
    contactSheet?: SnapshotPublic;
  };
};
