import { PaymentMethod } from './cash-register.interface';

export interface PaymentFormData {
  orderId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  changeGiven: number;
}
