declare module "nodemailer10" {
  type Recipient = string | { address: string };
  export type Transporter = {
    verify(): Promise<boolean>;
    close(): void;
    sendMail(message: {
      from?: string;
      to: string;
      subject: string;
      text: string;
    }): Promise<{ accepted?: Recipient[] }>;
  };
  const nodemailer: {
    createTransport(url: string, options?: {
      connectionTimeout?: number;
      greetingTimeout?: number;
      socketTimeout?: number;
    }): Transporter;
  };
  export default nodemailer;
}
