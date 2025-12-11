import { Client, Databases, Users, Query } from 'node-appwrite';
import nodemailer from 'nodemailer';

export default async ({ req, res, log, error }) => {
  // Initialize Appwrite
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const users = new Users(client);

  const databaseId = "68ba8a9c001f17064e15";
  const postEvalCollectionId = "68bf9d62002b4f5f7f23";
  const mainCollectionId = "68ba918c0022d2b9a429";

  try {
    log('Starting email reminder check...');
    
    const now = new Date().toISOString();
    
    // Find pending forms that need reminders
    const pendingForms = await databases.listDocuments(
      databaseId,
      postEvalCollectionId,
      [
        Query.equal('result', 'pending'),
        Query.lessThanEqual('reminderDate', now),
        Query.equal('reminderSent', false)
      ]
    );

    log(`Found ${pendingForms.documents.length} forms needing reminders`);

    let sentCount = 0;

    for (const form of pendingForms.documents) {
      try {
        // Get main form details
        const mainForm = await databases.getDocument(
          databaseId,
          mainCollectionId,
          form.$id
        );

        // Get user email (adjust based on your data structure)
        const userEmail = mainForm.email || mainForm.contactEmail;
        const userName = mainForm.userName || mainForm.customerName || 'User';

        if (!userEmail) {
          log(`No email found for form ${form.$id}`);
          continue;
        }

        // Send email
        await sendEmail(userEmail, userName, form, mainForm);

        // Mark as sent
        await databases.updateDocument(
          databaseId,
          postEvalCollectionId,
          form.$id,
          {
            reminderSent: true,
            reminderSentDate: new Date().toISOString()
          }
        );

        sentCount++;
        log(`✅ Reminder sent to ${userEmail}`);

      } catch (err) {
        error(`Error processing form ${form.$id}: ${err.message}`);
      }
    }

    return res.json({
      success: true,
      checked: pendingForms.documents.length,
      sent: sentCount
    });

  } catch (err) {
    error(`Fatal error: ${err.message}`);
    return res.json({ success: false, error: err.message }, 500);
  }
};

// Email sending function
async function sendEmail(toEmail, userName, postEvalForm, mainForm) {
  const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const formUrl = `${process.env.DOMAIN_URL}/posteval.html?id=${postEvalForm.$id}`;
  const customerName = mainForm.customerName || 'N/A';
  const projectName = mainForm.projectName || mainForm.productType || 'N/A';

  const emailText = `
Hello ${userName},

This is an automated reminder that your evaluation form for ${projectName} (${customerName}) is still pending in the Evaluation System.

Please update the form as soon as possible by clicking the link below:
${formUrl}

There is no need to reply to this email, as it has been automatically generated.

Thank you for your attention.

Evaluation System Team
  `;

  await transporter.sendMail({
    from: '"Evaluation System Team" <noreply@yourdomain.com>',
    to: toEmail,
    subject: 'Reminder: Update Your Pending Evaluation Form',
    text: emailText
  });
}
