export type Role = 'admin' | 'user';

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
};

export type CatalogItem = {
  id: string;
  name: string;
  active: boolean;
  created_at?: string;
};

export type TrainingRecord = {
  id: string;

  client_name: string;

  client_id?: string | null;

  site: string;
  training_date: string;
  facilitator_id: string;

  start_time: string;
  end_time: string;

  duration_minutes: number;

  activity_name: string;

  participants_count: number | null;

  observations: string | null;

  attachment_path: string | null;

  created_by: string;

  created_at: string;
  updated_at: string;

  facilitators?:
    | { name: string }
    | { name: string }[]
    | null;
};