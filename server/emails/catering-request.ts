import type { CateringNotification } from "../catering.js"

export function cateringRequestEmail(request: CateringNotification) {
  return {
    subject: `TeachersVIP catering enquiry: ${request.school_name.replace(/[\r\n]/g, " ")} (${request.guest_count} guests)`,
    text: [
      `A verified TeachersVIP educator has requested a catering quote from ${request.business_name}.`,
      "Reply directly to the educator with availability, your school/educator perk, menu and pricing.",
      "This is an enquiry. No order, price or booking has been confirmed.",
      "",
      `Reference: ${request.id}`,
      `School: ${request.school_name}`,
      `Contact: ${request.contact_name}`,
      `Email: ${request.contact_email}`,
      `Phone: ${request.contact_phone || "Not supplied"}`,
      `Event: ${request.event_type}`,
      `Date: ${request.event_date}`,
      `Local event time: ${request.event_time || "To be discussed"}`,
      `Guests: ${request.guest_count}`,
      `Budget: ${request.budget || "To be discussed"}`,
      `Event location / delivery address: ${request.delivery_address}`,
      `Dietary requirements: ${request.dietary_requirements || "Not supplied"}`,
      `Notes: ${request.notes || "None"}`,
      "",
      "The educator agreed to share these details with your business and TeachersVIP for this enquiry.",
    ].join("\n"),
  }
}
