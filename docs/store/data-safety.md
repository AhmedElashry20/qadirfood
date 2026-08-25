# Store Data-Disclosure Answers — Qadir Food

Ready-to-enter answers for the app-store privacy forms, per app. These are based strictly on the data Qadir Food actually collects. **Key facts that apply to all three apps:**

- **No advertising, no ad tracking, no data brokers, no sale of data.** Data is used only to operate the service.
- **All data is encrypted in transit (HTTPS/TLS).**
- **Users can request deletion** (in-app: Settings → Account → Delete Account, or at **[Domain]/delete-account**).
- Card/payment details are handled directly by the **Moyasar** gateway (PCI DSS); we do not store full card data.
- Maps, notifications, and payments are handled by **service providers / processors** acting on our behalf. Under Google Play's definition, transfers to such processors are generally **not** counted as "sharing"; transfers to another user needed to deliver the order (the delivery captain, the merchant) are disclosed transparently below.

> Placeholders: **[Company Name]**, **[Email]**, **[Domain]**, **[Maps provider]**, **[Notifications provider]**. If you later add an analytics or crash-reporting SDK (e.g., Firebase Crashlytics), you MUST add "App info and performance → Crash logs / Diagnostics" and re-submit both forms.

---

# 1. Customer App — قادر فود (com.qadirfood.customer_app)

## 1.1 Google Play — Data Safety

**Global questions**
- Does your app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes**
- Do you provide a way for users to request that their data be deleted? **Yes**
- Is your app designed for children / does it target children? **No** (adults 18+)

**Data types**

| Category → Data type | Collected | Shared | Processed ephemerally | Required/Optional | Purposes |
|---|---|---|---|---|---|
| Location → Precise location | Yes | Yes (to delivery captain & [Maps provider] to complete delivery) | No | Required | App functionality |
| Personal info → Name | Yes | Yes (to captain & merchant to fulfill the order) | No | Required | App functionality; Account management |
| Personal info → Phone number | Yes | Yes (to captain, via proxy where possible) | No | Required | App functionality; Account management; Fraud prevention, security & compliance |
| Personal info → Address | Yes | Yes (to captain to complete delivery) | No | Required | App functionality |
| Financial info → Purchase history (order history) | Yes | No | No | Required | App functionality |
| Financial info → Payment info | Not collected by us (processed directly by Moyasar) | No | — | — | App functionality |
| App activity → App interactions | Yes (order status, in-app actions) | No | No | Required | App functionality |
| Device or other IDs → Device/push token | Yes | No | No | Optional | App functionality (order-status notifications) |

Notes:
- We do not collect: email, contacts, messages, browsing/search history, health/fitness, calendar, or audio.
- Cash on delivery is available; no payment data is collected for cash orders.

## 1.2 Apple — App Privacy

**Data Used to Track You:** **None.** (No cross-app/ third-party ad tracking, no data brokers.)

**Data Linked to You** (used and tied to identity):
- **Contact Info:** Name, Phone Number, Physical Address
- **Location:** Precise Location
- **Financial Info:** Purchase History (order history). *Payment method data is handled by Moyasar, not by the app.*
- **User Content:** Customer Support (support messages), Photos or Videos (optional drop-off photo, if used)
- **Identifiers:** User ID
- **Usage Data:** Product Interaction

Purposes for the above: **App Functionality** (and, for Name/Phone/User ID, Account management under App Functionality).

**Data Not Linked to You:** None declared. (We do not collect anonymous analytics.)

---

# 2. Captain App — كابتن قادر فود (com.qadirfood.captain_app)

## 2.1 Google Play — Data Safety

**Global questions**
- Collects or shares user data? **Yes**
- Encrypted in transit? **Yes**
- Users can request deletion? **Yes**
- Targets children? **No** (adults 18+; captains are working adults)

**Data types**

| Category → Data type | Collected | Shared | Processed ephemerally | Required/Optional | Purposes |
|---|---|---|---|---|---|
| Location → Precise location (incl. background) | Yes | Yes (to customer/merchant & [Maps provider] to enable tracking during an active delivery) | No | Required | App functionality |
| Personal info → Name | Yes | Yes (to customer/merchant for the assigned order) | No | Required | App functionality; Account management |
| Personal info → Phone number | Yes | Yes (to customer, via proxy where possible) | No | Required | App functionality; Account management |
| Personal info → Other info (National ID / Iqama number) | Yes | No | No | Required | Fraud prevention, security & compliance |
| Photos and videos → Photos (daily verification selfie, ID/vehicle documents) | Yes | No | No | Required | Fraud prevention, security & compliance |
| Financial info → Other financial info (payout/earnings) | Yes | No | No | Required | App functionality |
| App activity → App interactions | Yes | No | No | Required | App functionality |
| Device or other IDs → Device/push token | Yes | No | No | Optional | App functionality (order notifications) |

Notes:
- **Background location** is collected only during an active shift/delivery and is used for order tracking, routing, and safety. This requires the prominent-disclosure + runtime consent flow, and (for Android) the Play "Location Permissions" declaration.
- The **daily selfie** is used for face/identity verification (fraud prevention) and is retained only for a limited period (see Privacy Policy). Declared under "Photos and videos" as there is no dedicated biometric category on Google Play.

## 2.2 Apple — App Privacy

**Data Used to Track You:** **None.**

**Data Linked to You:**
- **Contact Info:** Name, Phone Number
- **Location:** Precise Location (including background/while-in-use during shifts)
- **Sensitive Info:** ID/verification data — National ID/Iqama and daily face-verification selfie (biometric-style identity check)
- **User Content:** Photos or Videos (verification selfie, documents), Customer Support
- **Financial Info:** Other Financial Info (earnings/payouts)
- **Identifiers:** User ID
- **Usage Data:** Product Interaction

Purposes: **App Functionality** and **Fraud Prevention / Security** (for ID, selfie, and documents).

**Data Not Linked to You:** None declared.

---

# 3. Merchant App — مطعم قادر فود (com.qadirfood.merchant_app)

## 3.1 Google Play — Data Safety

**Global questions**
- Collects or shares user data? **Yes**
- Encrypted in transit? **Yes**
- Users can request deletion? **Yes**
- Targets children? **No** (business users, adults 18+)

**Data types**

| Category → Data type | Collected | Shared | Processed ephemerally | Required/Optional | Purposes |
|---|---|---|---|---|---|
| Personal info → Name | Yes (owner/staff contact) | No | No | Required | App functionality; Account management |
| Personal info → Phone number | Yes | No | No | Required | App functionality; Account management |
| Personal info → Address | Yes (store location) | No | No | Required | App functionality |
| Location → Precise location | Yes (store location/geocoding) | No | No | Required | App functionality |
| Financial info → Other financial info (settlement/payout details, e.g., IBAN) | Yes | No | No | Required | App functionality; Fraud prevention, security & compliance |
| Photos and videos → Photos (menu/product images) | Yes | No | No | Optional | App functionality |
| App activity → App interactions | Yes (incoming orders, status) | No | No | Required | App functionality |
| Device or other IDs → Device/push token | Yes | No | No | Optional | App functionality (new-order notifications) |

Notes:
- The merchant app displays incoming customer order details (customer first name, delivery notes) to prepare orders; this is order data received to operate the service, not additional data the merchant app collects about its own user.
- No captain ID/selfie data is collected in this app.

## 3.2 Apple — App Privacy

**Data Used to Track You:** **None.**

**Data Linked to You:**
- **Contact Info:** Name, Phone Number, Physical Address (store)
- **Location:** Precise Location (store location)
- **Financial Info:** Other Financial Info (settlement/payout details)
- **User Content:** Photos or Videos (menu/product images), Customer Support
- **Identifiers:** User ID
- **Usage Data:** Product Interaction

Purposes: **App Functionality** (and Account management under App Functionality).

**Data Not Linked to You:** None declared.

---

## Summary matrix (all apps)

| Data | Customer | Captain | Merchant |
|---|---|---|---|
| Name | ✅ | ✅ | ✅ |
| Phone number | ✅ | ✅ | ✅ |
| Precise location | ✅ | ✅ (incl. background) | ✅ (store) |
| Address | ✅ | — | ✅ (store) |
| Order/purchase history | ✅ | — | — (receives orders) |
| Payment info | via Moyasar | — | — |
| Financial (payout/settlement) | — | ✅ | ✅ |
| Photos | optional | ✅ (selfie + docs) | ✅ (menu, optional) |
| National ID / Iqama | — | ✅ | — |
| Device/push token | ✅ | ✅ | ✅ |
| Used to track you (ads) | ❌ | ❌ | ❌ |
| Data sold | ❌ | ❌ | ❌ |
| Encrypted in transit | ✅ | ✅ | ✅ |
| Deletion available | ✅ | ✅ | ✅ |
