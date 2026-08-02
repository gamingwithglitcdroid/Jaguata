export enum UserRole {
  OWNER = 'owner',
  WALKER = 'walker',
  ADMIN = 'admin',
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  role: UserRole;
  bio?: string;
  address?: string;
  age?: number;
  experience?: string;
  rating?: number;
  walkCount?: number;
  isAvailable?: boolean; // For walkers
  isApproved?: boolean; // For walkers
  rejectedWalkIds?: string[]; // For walkers to hide rejected requests
  fcmToken?: string;
  isAdmin?: boolean;
  ci?: string;
  ciFrontPhoto?: string;
  ciBackPhoto?: string;
  selfieWithCiPhoto?: string;
  ciVerificationStatus?: 'none' | 'pending' | 'verified' | 'rejected';
  ciVerificationResult?: string;
  policeRecordPhoto?: string;
  city?: string;
  neighborhood?: string;
  phoneNumber?: string;
  termsAccepted?: boolean;
  termsAcceptedAt?: string;
  lastLogin?: string; // New field for security
  theme?: 'light' | 'dark';
  isSuspended?: boolean;
  suspensionReason?: string;
  suspendedUntil?: string;
  createdAt: string;
}

export interface UserSession {
  id: string;
  userId: string;
  device: string;
  browser: string;
  os: string;
  lastSeen: string;
  ip?: string;
  isCurrent?: boolean;
}

export interface Pet {
  id: string;
  ownerId: string;
  name: string;
  breed: string;
  age: number;
  size?: 'small' | 'medium' | 'large'; // Pequeño, Mediano, Grande
  weight?: number; // Keep for legacy if needed
  medications?: string;
  allergies?: string;
  accessInstructions?: string; // Lockbox info
  photos: string[];
  behaviorNotes: string;
  createdAt: string;
}

export enum WalkStatus {
  REQUESTED = 'requested',
  PENDING_OWNER = 'pending_owner',
  ACCEPTED = 'accepted',
  WALKER_ARRIVED = 'walker_arrived',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface Walk {
  id: string;
  ownerId: string;
  walkerId?: string;
  petIds: string[];
  status: WalkStatus;
  durationOption: 20 | 30 | 60;
  isScheduled?: boolean;
  scheduledFor?: string;
  pickupLocation: {
    lat: number;
    lng: number;
    address: string;
  };
  currentLocation?: {
    lat: number;
    lng: number;
  };
  path?: { lat: number; lng: number }[]; // For GPS tracking
  startPhoto?: string;
  endPhoto?: string;
  startTime?: string;
  walkerArrivedAt?: string;
  confirmedAt?: string;
  acceptedAt?: string; // When owner confirmation happens
  rejectedWalkerIds?: string[];
  endTime?: string;
  durationMinutes?: number;
  cost?: number;
  tipAmount?: number;
  rating?: number;
  ratingComment?: string;
  report?: {
    photos: string[];
    notes: string;
    peeCount?: number;
    poopCount?: number;
    peed?: boolean;
    pooped?: boolean;
    drankWater?: boolean;
    behavior?: string;
    aiSummary?: string;
    distanceMiles?: number;
  };
  createdAt: string;
}

export interface Message {
  id: string;
  walkId: string;
  senderId: string;
  text: string;
  createdAt: string;
  read?: boolean;
  readAt?: string;
}

export interface Transaction {
  id: string;
  walkId: string;
  userId: string;
  amount: number;
  method: 'card' | 'transfer' | 'cash';
  status: 'pending' | 'completed' | 'failed';
  type?: 'walk' | 'tip';
  createdAt: string;
}

export interface Notification {
  id?: string;
  userId: string;
  title: string;
  body: string;
  type: 'walk_accepted' | 'walk_started' | 'walk_completed' | 'walker_arrived' | 'new_message' | 'walk_cancelled' | 'walk_requested' | 'walker_request' | 'walker_approved';
  walkId?: string;
  read: boolean;
  createdAt: string;
}
