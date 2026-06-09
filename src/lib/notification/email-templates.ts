const platformName = () => process.env.PLATFORM_NAME?.trim() || 'Remote Access';

const platformUrl = () => process.env.PLATFORM_URL?.trim() || '';

function layout(title: string, body: string): string {
  const brand = platformName();
  const url = platformUrl();
  const footer = url
    ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280;">Sent by <a href="${url}" style="color:#4f46e5;text-decoration:none;">${brand}</a></p>`
    : `<p style="margin:24px 0 0;font-size:12px;color:#6b7280;">Sent by ${brand}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 32px;">
          <h1 style="margin:0;font-size:18px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;">${title}</h1>
        </td></tr>
        <tr><td style="padding:32px;">${body}${footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:#6b7280;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:500;">${value}</td>
  </tr>`;
}

function detailsTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;border-top:1px solid #e5e7eb;padding-top:8px;">${rows}</table>`;
}

function formatTimestamp(date: Date): string {
  return (
    date.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

export type EnrollmentLinkOpenedParams = {
  code: string;
  linkUrl: string;
  openedAt: Date;
};

export function enrollmentLinkOpenedEmail(params: EnrollmentLinkOpenedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Enrollment link opened — ${params.code}`;
  const text = [
    `Someone opened your enrollment link.`,
    ``,
    `Code: ${params.code}`,
    `Link: ${params.linkUrl}`,
    `Time: ${formatTimestamp(params.openedAt)}`,
  ].join('\n');

  const html = layout(
    'Enrollment Link Opened',
    `<p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      Someone has opened your enrollment link. They may be reviewing installation instructions or preparing to enroll a device.
    </p>
    ${detailsTable(
      detailRow(
        'Link code',
        `<code style="background:#f3f4f6;padding:2px 8px;border-radius:4px;font-size:13px;">${params.code}</code>`,
      ) + detailRow('Opened at', formatTimestamp(params.openedAt)),
    )}`,
  );

  return { subject, html, text };
}

export type AgentDownloadedParams = {
  code: string;
  downloadedAt: Date;
};

export function agentDownloadedEmail(params: AgentDownloadedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Agent installer downloaded — ${params.code}`;
  const text = [
    `The remote agent installer was downloaded using your enrollment link.`,
    ``,
    `Code: ${params.code}`,
    `Time: ${formatTimestamp(params.downloadedAt)}`,
  ].join('\n');

  const html = layout(
    'Agent Installer Downloaded',
    `<p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      The Windows remote agent installer was downloaded using your enrollment link. The user may install the agent and complete enrollment shortly.
    </p>
    ${detailsTable(
      detailRow(
        'Link code',
        `<code style="background:#f3f4f6;padding:2px 8px;border-radius:4px;font-size:13px;">${params.code}</code>`,
      ) + detailRow('Downloaded at', formatTimestamp(params.downloadedAt)),
    )}`,
  );

  return { subject, html, text };
}

export type DeviceEnrolledParams = {
  deviceName: string;
  hostname: string;
  os: string;
  code: string;
  enrolledAt: Date;
};

export function deviceEnrolledEmail(params: DeviceEnrolledParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Device enrolled — ${params.deviceName}`;
  const text = [
    `A new device has been enrolled using your enrollment link.`,
    ``,
    `Device: ${params.deviceName}`,
    `Hostname: ${params.hostname}`,
    `OS: ${params.os}`,
    `Link code: ${params.code}`,
    `Time: ${formatTimestamp(params.enrolledAt)}`,
  ].join('\n');

  const html = layout(
    'Device Enrolled Successfully',
    `<p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      A new device has completed enrollment and is ready for remote access.
    </p>
    ${detailsTable(
      detailRow('Device', params.deviceName) +
        detailRow('Hostname', params.hostname) +
        detailRow('Operating system', params.os) +
        detailRow(
          'Link code',
          `<code style="background:#f3f4f6;padding:2px 8px;border-radius:4px;font-size:13px;">${params.code}</code>`,
        ) +
        detailRow('Enrolled at', formatTimestamp(params.enrolledAt)),
    )}`,
  );

  return { subject, html, text };
}

export type DeviceStatusParams = {
  deviceName: string;
  hostname: string;
  os?: string;
  changedAt: Date;
};

export function deviceOnlineEmail(params: DeviceStatusParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Device online — ${params.deviceName}`;
  const text = [
    `${params.deviceName} is now online and ready to connect.`,
    ``,
    `Hostname: ${params.hostname}`,
    `Time: ${formatTimestamp(params.changedAt)}`,
  ].join('\n');

  const html = layout(
    'Device Online &amp; Ready',
    `<p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      <strong style="color:#059669;">${params.deviceName}</strong> is now online and available for a remote session. You can connect from your dashboard.
    </p>
    ${detailsTable(
      detailRow('Hostname', params.hostname) +
        (params.os ? detailRow('Operating system', params.os) : '') +
        detailRow(
          'Status',
          '<span style="color:#059669;font-weight:600;">Online</span>',
        ) +
        detailRow('Detected at', formatTimestamp(params.changedAt)),
    )}`,
  );

  return { subject, html, text };
}

export function deviceOfflineEmail(params: DeviceStatusParams): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Device offline — ${params.deviceName}`;
  const text = [
    `${params.deviceName} has gone offline.`,
    ``,
    `Hostname: ${params.hostname}`,
    `Time: ${formatTimestamp(params.changedAt)}`,
  ].join('\n');

  const html = layout(
    'Device Went Offline',
    `<p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
      <strong style="color:#dc2626;">${params.deviceName}</strong> is no longer reachable. Remote sessions cannot be started until the device comes back online.
    </p>
    ${detailsTable(
      detailRow('Hostname', params.hostname) +
        (params.os ? detailRow('Operating system', params.os) : '') +
        detailRow(
          'Status',
          '<span style="color:#dc2626;font-weight:600;">Offline</span>',
        ) +
        detailRow('Detected at', formatTimestamp(params.changedAt)),
    )}`,
  );

  return { subject, html, text };
}
