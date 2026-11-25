# Knit&Crochet by Faith — Supabase Auth email templates

**Status: prepared, not applied.** Supabase currently has custom SMTP disabled, and its dashboard says templates cannot be edited until custom SMTP is set up. These templates are ready to paste into Supabase Auth → Emails after the owner configures a verified business-controlled sender. No email has been sent or received as part of this task.

The layout reuses the storefront’s existing yellow (`#FFD333`), charcoal (`#3D464D`), light gray (`#F5F5F5`) and system-font styling. It uses a text wordmark, inline styling, one clear action button, no externally hosted images, and no invented sender/contact details. All three action links use Supabase’s `{{ .ConfirmationURL }}` variable so Supabase retains the action token and the flow’s configured redirect. Do not replace it with a hardcoded URL or `{{ .SiteURL }}`.

## Confirm sign up

**Subject:** Confirm your email — Knit&Crochet by Faith

```html
<div style="margin:0;padding:24px 12px;background-color:#F5F5F5;font-family:Arial,Helvetica,sans-serif;color:#3D464D;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E6E6E6;border-radius:8px;">
    <tr>
      <td style="padding:24px 28px;background-color:#3D464D;border-radius:8px 8px 0 0;">
        <span style="display:inline-block;padding:8px 10px;background-color:#FFD333;color:#3D464D;font-size:16px;font-weight:700;letter-spacing:.2px;">Knit&amp;Crochet by Faith</span>
      </td>
    </tr>
    <tr>
      <td style="padding:30px 28px 12px;">
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:#3D464D;">Confirm your email</h1>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#4F565B;">Please confirm this email address to finish creating your customer account.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
          <tr>
            <td style="background-color:#FFD333;border-radius:5px;text-align:center;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 20px;color:#3D464D;text-decoration:none;font-size:16px;font-weight:700;">Confirm email address</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#626A70;">If you did not create an account, you can ignore this email.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;border-top:1px solid #E6E6E6;font-size:12px;line-height:1.5;color:#737B80;">Knit&amp;Crochet by Faith</td>
    </tr>
  </table>
</div>
```

## Reset password

**Subject:** Reset your password — Knit&Crochet by Faith

```html
<div style="margin:0;padding:24px 12px;background-color:#F5F5F5;font-family:Arial,Helvetica,sans-serif;color:#3D464D;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E6E6E6;border-radius:8px;">
    <tr>
      <td style="padding:24px 28px;background-color:#3D464D;border-radius:8px 8px 0 0;">
        <span style="display:inline-block;padding:8px 10px;background-color:#FFD333;color:#3D464D;font-size:16px;font-weight:700;letter-spacing:.2px;">Knit&amp;Crochet by Faith</span>
      </td>
    </tr>
    <tr>
      <td style="padding:30px 28px 12px;">
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:#3D464D;">Reset your password</h1>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#4F565B;">We received a request to reset the password for your account. Use the button below to continue.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
          <tr>
            <td style="background-color:#FFD333;border-radius:5px;text-align:center;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 20px;color:#3D464D;text-decoration:none;font-size:16px;font-weight:700;">Reset password</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#626A70;">If you did not request a password reset, you can ignore this email. Your password will not change unless you complete the reset.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;border-top:1px solid #E6E6E6;font-size:12px;line-height:1.5;color:#737B80;">Knit&amp;Crochet by Faith</td>
    </tr>
  </table>
</div>
```

## Invite user

**Subject:** You’re invited — Knit&Crochet by Faith

```html
<div style="margin:0;padding:24px 12px;background-color:#F5F5F5;font-family:Arial,Helvetica,sans-serif;color:#3D464D;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E6E6E6;border-radius:8px;">
    <tr>
      <td style="padding:24px 28px;background-color:#3D464D;border-radius:8px 8px 0 0;">
        <span style="display:inline-block;padding:8px 10px;background-color:#FFD333;color:#3D464D;font-size:16px;font-weight:700;letter-spacing:.2px;">Knit&amp;Crochet by Faith</span>
      </td>
    </tr>
    <tr>
      <td style="padding:30px 28px 12px;">
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:#3D464D;">You’ve been invited</h1>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#4F565B;">An authorized administrator invited you to join Knit&amp;Crochet by Faith. Use the button below to accept the invitation and continue securely.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
          <tr>
            <td style="background-color:#FFD333;border-radius:5px;text-align:center;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 20px;color:#3D464D;text-decoration:none;font-size:16px;font-weight:700;">Accept invitation</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#626A70;">If you were not expecting this invitation, you can ignore this email. Access is controlled by the store’s administrator permissions.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;border-top:1px solid #E6E6E6;font-size:12px;line-height:1.5;color:#737B80;">Knit&amp;Crochet by Faith</td>
    </tr>
  </table>
</div>
```

## Apply and test after SMTP is ready

1. The owner should choose a legitimate business-controlled sending domain and email provider, verify the domain with that provider, and configure its recommended SPF/DKIM/DMARC records. Do not use an address merely because it looks plausible.
2. In Supabase project `sdsiahwkxisvfayvkbkf`, open **Authentication → Emails → SMTP Settings**, enable custom SMTP, and enter the provider’s host, port, username, password, and the provider-verified sender address/name there. Keep SMTP credentials only in the provider and Supabase configuration; never paste them in chat, frontend files, source control, or logs. Leave email confirmation enabled.
3. Paste each subject/body into its matching Supabase template: **Confirm sign up**, **Reset password**, and **Invite user**. Keep the production URL Configuration callbacks already set for `https://fkshopping.netlify.app/multishop/account.html`; the app’s signup, recovery, and admin-invite flows supply their own query-string callback values.
4. Send controlled tests only after configuration. Verify actual inbox/spam receipt, provider delivery status, Supabase Auth logs, and the production callback for signup confirmation, password recovery, and an authorized admin invitation. Then test successful and expired/invalid links, owner sign-in, and access permissions. Record any workflow not exercised as **NOT TESTED**.
5. Do not turn off confirmation to work around email failures. If a sender/domain or provider is not yet available, stop before sending customer-facing tests.

Supabase notes that its default SMTP service only sends to authorized project/team addresses, is rate-limited, has no delivery SLA, and is intended for non-production use. Current official docs state a limit of 2 messages per hour, subject to change. Custom SMTP is required for production delivery and template editing.

## References

- [Supabase Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
