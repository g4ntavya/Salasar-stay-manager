// Stub functions for WhatsApp messaging
// In production, this would call Firebase Cloud Functions

export type WhatsAppMessageType = 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED' | 'CHECKED_OUT';

interface SendWhatsAppParams {
  bookingId: string;
  customerMobile: string;
  messageType: WhatsAppMessageType;
}

export const sendWhatsAppMessage = async (params: SendWhatsAppParams): Promise<boolean> => {
  console.log('📱 WhatsApp Message (Stub)', params);
  
  // Stub implementation - would call Cloud Function in production
  // const response = await fetch('https://...cloudfunctions.net/sendWhatsApp', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(params)
  // });
  
  // Simulate delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Simulate success
  return true;
};

export const getWhatsAppMessageTemplate = (messageType: WhatsAppMessageType): string => {
  switch (messageType) {
    case 'BOOKING_CONFIRMED':
      return 'Your booking at Shri Salasar Sewa Sadan has been confirmed! We look forward to your stay.';
    case 'BOOKING_CANCELLED':
      return 'Your booking at Shri Salasar Sewa Sadan has been cancelled. Thank you.';
    case 'CHECKED_OUT':
      return 'Thank you for staying at Shri Salasar Sewa Sadan! We hope to see you again soon.';
    default:
      return 'Thank you for choosing Shri Salasar Sewa Sadan.';
  }
};
