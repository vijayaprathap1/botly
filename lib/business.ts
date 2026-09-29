/** Your business details for legal pages, the footer and Razorpay's website review. Set them in the environment. */
export const business = {
  get name() {
    return process.env.BUSINESS_LEGAL_NAME || "Botly";
  },
  get email() {
    return process.env.SUPPORT_EMAIL || "support@your-domain";
  },
  get phone() {
    return process.env.SUPPORT_PHONE || "";
  },
  get address() {
    return process.env.BUSINESS_ADDRESS || "";
  },
  get city() {
    return process.env.BUSINESS_CITY || "Chennai";
  },
  get grievanceOfficer() {
    return process.env.GRIEVANCE_OFFICER || "";
  },
};
