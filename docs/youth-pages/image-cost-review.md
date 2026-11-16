# Team-photo upload cost review — 2026-11-11

Current status: the user approved proceeding and personally activated transformations-only Images and R2 after reviewing their checkout terms. Images is $0 base fee with 5,000 transformations included; R2 uses Standard included allowances and automatic overages. Hosted Images/Stream storage was left unchecked. Workers was not upgraded. Staging uploads are now enabled and verified; the price review below explains the chosen route, not a hard spending cap.

## Proposed route

Keep Workers Free. Use the Images binding to validate/resize/re-encode each upload once, save only its sanitized output to private R2, and serve saved bytes on subsequent visits. This avoids doing CPU-heavy JPEG processing in JavaScript and avoids requiring a DNS change to the externally managed Webnode domain. It requires account activation/entitlement verification and real binding tests; local mocks do not establish entitlement. Do not enable the existing JavaScript normalization path on Workers Free merely by flipping the upload flag.

## Verified prices

The authenticated account's Images & Stream Plans screen offers **Starting at $0/month**, including **5,000 unique transformations/month**, then **$1 per additional 2,000 transformations**. This is the usage-billed plan, not a hard-capped free service. Do not select the separate $5/month Starter Bundle or enable hosted images/video storage. Official Images documentation expresses transformation pricing as $0.50/1,000 beyond the first 5,000, and says only transformation charges apply when storage is outside Images.

R2 Standard storage includes **10 GB-month**, **1 million Class A operations** (writes/lists) and **10 million Class B operations** (reads) monthly. Beyond those allowances: **$0.015/GB-month**, **$4.50/million Class A**, and **$0.36/million Class B**. Egress is free. Billing-unit rounding applies. Use Standard, not Infrequent Access. R2's free allowances are account-wide and automatic overage billing applies after subscription activation.

Illustrative low-volume use: 100 uploads processed once each in a month, 100 stored 3 MB files (about 0.3 GB), and 10,000 reads would fit those allowances, assuming other account usage does not consume them. Estimated Images/R2 usage charge in that scenario: **$0**. This is an example, not a guaranteed maximum bill. Retained published-history photos also occupy storage. No paid Workers base subscription is proposed for this route; existing Free request/CPU limits still apply to ordinary API work.

Before activation, review the actual checkout total, taxes, recurring/overage terms and billing recipient. Configure a low budget alert if available; alerts do not impose a spending cap. A per-team/application upload quota can reduce this feature's transformation exposure but cannot cap unrelated account-wide usage. Stop on a transformation limit/failure without publishing an original or changing the current photo.

Sources: [Images pricing](https://developers.cloudflare.com/images/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/), [upload-to-R2 binding requirements](https://developers.cloudflare.com/images/tutorials/optimize-user-uploaded-image/). Dashboard figures above were read in the signed-in account, without selecting a purchase button.
