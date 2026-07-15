export type UserTaskStatus = "available" | "pending" | "verified" | "claimed";

export interface Profile {
  id: string;
  invitation_code: string;
  nickname: string | null;
  avatar_url: string | null;
  is_child: boolean;
  linked_parents: string[];
  linked_children: string[];
  created_at: string;
}

export interface Task {
  id: string;
  task_no: string;
  /** Display category from CSV `cat` (also used as card title). */
  category: string;
  exp: number;
  gem: number;
  title: string | null;
  description: string | null;
  requires_proof: boolean;
  seq: number | null;
  prereq_1: string | null;
  prereq_2: string | null;
}

/** Ended session shown as a compact Finished log row. */
export interface SessionLogItem {
  id: string;
  ended_at: string;
  exp_earned: number;
  is_tutorial: boolean;
}

export interface UserTask {
  id: string;
  user_id: string;
  task_id: string;
  status: UserTaskStatus;
  completed_at: string | null;
  proof_data: ProofData | null;
  marked_by_user_id?: string | null;
  marked_by_nickname?: string | null;
  task?: Task;
}

export interface ProofData {
  photo_url?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

export interface Session {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  start_photo_url: string | null;
  end_photo_url: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  exp_earned: number;
  is_tutorial: boolean;
  location_consistent: boolean | null;
  conducted_by_user_id?: string | null;
  conductor_nickname?: string | null;
}

export interface Milestone {
  id: string;
  gem_threshold: number;
  title: string;
  prize_name: string | null;
  prize_description: string | null;
  icon: string | null;
}

export interface UserMilestone {
  id: string;
  user_id: string;
  milestone_id: string;
  unlocked_at: string;
  claimed: boolean;
  milestone?: Milestone;
}

export interface ActiveSessionState {
  sessionId: string;
  /** UTC ISO start time from the server */
  startedAt: string;
  /** UTC ISO server clock at the moment this payload was built (for client sync) */
  serverNow: string;
  isTutorial: boolean;
}
