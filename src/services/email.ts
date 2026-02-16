import nodemailer from "nodemailer";
import { env } from "../config.js";

export type EmailLocale = "en" | "de";

export type InviteTemplateInput = {
  locale: EmailLocale;
  role: "REVIEWER" | "APPROVER";
  processId: string;
  token: string;
};

export type ReminderTemplateInput = {
  locale: EmailLocale;
  processId: string;
  message?: string;
};

export type StatusTemplateInput = {
  locale: EmailLocale;
  processId: string;
  status: string;
};

const templates = {
  en: {
    inviteSubject: (role: string) => `OpenApprove invitation (${role})`,
    inviteBody: (input: InviteTemplateInput) =>
      `You have been invited as ${input.role} for process ${input.processId}.\n\n` +
      `Open: ${env.BASE_URL}/project/${input.token}\n\n` +
      `This link contains a token. Do not share it.`,
    reminderSubject: () => `OpenApprove reminder`,
    reminderBody: (input: ReminderTemplateInput) =>
      `Reminder for process ${input.processId}.\n\n${input.message ?? ""}`,
    statusSubject: () => `OpenApprove status update`,
    statusBody: (input: StatusTemplateInput) =>
      `Process ${input.processId} is now ${input.status}.`
  },
  de: {
    inviteSubject: (role: string) => `OpenApprove Einladung (${role})`,
    inviteBody: (input: InviteTemplateInput) =>
      `Sie wurden als ${input.role} für den Prozess ${input.processId} eingeladen.\n\n` +
      `Öffnen: ${env.BASE_URL}/project/${input.token}\n\n` +
      `Dieser Link enthält ein Token. Bitte nicht teilen.`,
    reminderSubject: () => `OpenApprove Erinnerung`,
    reminderBody: (input: ReminderTemplateInput) =>
      `Erinnerung für den Prozess ${input.processId}.\n\n${input.message ?? ""}`,
    statusSubject: () => `OpenApprove Status`,
    statusBody: (input: StatusTemplateInput) =>
      `Prozess ${input.processId} ist jetzt ${input.status}.`
  }
};

function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    throw new Error("SMTP not configured");
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });
}

export async function sendInviteEmail(to: string, input: InviteTemplateInput) {
  const tpl = templates[input.locale] ?? templates.en;
  const transporter = getTransporter();
  return transporter.sendMail({
    to,
    from: env.SMTP_FROM,
    subject: tpl.inviteSubject(input.role),
    text: tpl.inviteBody(input)
  });
}

export async function sendReminderEmail(to: string, input: ReminderTemplateInput) {
  const tpl = templates[input.locale] ?? templates.en;
  const transporter = getTransporter();
  return transporter.sendMail({
    to,
    from: env.SMTP_FROM,
    subject: tpl.reminderSubject(),
    text: tpl.reminderBody(input)
  });
}

export async function sendStatusEmail(to: string, input: StatusTemplateInput) {
  const tpl = templates[input.locale] ?? templates.en;
  const transporter = getTransporter();
  return transporter.sendMail({
    to,
    from: env.SMTP_FROM,
    subject: tpl.statusSubject(),
    text: tpl.statusBody(input)
  });
}
