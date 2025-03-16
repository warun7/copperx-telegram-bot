import { Context } from "telegraf";
import { Update } from "telegraf/typings/core/types/typegram";

// User types
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  organizationId: string;
  kycStatus?: KYCStatus;
}

export interface UserSession {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  token: string;
  organizationId: string;
  status?: string;
}

export enum KYCStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  NOT_SUBMITTED = "NOT_SUBMITTED",
}

// Wallet types
export interface Wallet {
  id: string;
  name: string;
  address: string;
  network: string;
  isDefault: boolean;
}

export interface WalletBalance {
  walletId: string;
  balance: string;
  network: string;
}

// Transfer types
export interface Transfer {
  id: string;
  amount: string;
  fee: string;
  status: TransferStatus;
  type: TransferType;
  createdAt: string;
  recipient?: string;
  network?: string;
}

export enum TransferStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export enum TransferType {
  EMAIL = "EMAIL",
  WALLET = "WALLET",
  BANK = "BANK",
  DEPOSIT = "DEPOSIT",
}

// Context type for Telegraf
export interface BotContext extends Context<Update> {
  session: {
    user?: UserSession;
    authState?: AuthState;
    transferState?: {
      type?: string;
      recipient?: string;
      amount?: string;
      network?: string;
    };
    historyState?: {
      page: number;
      limit: number;
    };
    walletAddresses?: string[];
    depositState?: {
      network?: string;
      chainId?: number | string;
      amount?: string;
    };
  };
}

export interface AuthState {
  email?: string;
  awaitingOTP: boolean;
  sid?: string;
}
