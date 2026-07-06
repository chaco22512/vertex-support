# 要確認リスト（スタッフ確認用）

全695ルール中、42件。理由は2種類：(A) 取り消し線の旧文言を自動削除したので現行文言の確認、(B) 社内オペ用キーワードを含むため internal（AI回答対象外）に自動分類したことの妥当性確認。


## GENERAL RULES

- **R028** [B:internal自動分類] VDM GMO account number- if customer paid via GMO even the payment method is smartpit in the same month - ask approval in #mur-discount-confirmation slack channel
- **R036** [B:internal自動分類] For Bank transfer, please input in ALL REQUEST with the bank receipt and customer number/smartpit number/phone number after paid ( please recommend customer to pay by SMARTPIT)
- **R041** [B:internal自動分類] Lacking payment by bank transfer- AR staff will inform seller/support, customer can paid right away or add for next month's bill (late payment fee, additional sms/call charge, lack
- **R042** [B:internal自動分類] Over payment (no limit) will be deducted on the next month's bill- by request in AR
- **R053** [B:internal自動分類] For returned item and needs to refund but returned without the freebies, freebies price will be deducted from the total cod amount (refer to mashup lvl3 itemlist for freebies price
- **R054** [B:internal自動分類] Deposit fee: Plans with deposit fee (unpaid bill other fees can be deducted to deposit fee)- Request in AR to process
- **R055** [B:internal自動分類] Deposit fee that needs to refund, process the refund like the usual via order sheet
- **R063** [B:internal自動分類] PUK PIN/CODE can be informed by request in ALL REQUEST (2-3 Working days is required) | ☆★All Request Sheet★☆
- **R064** [B:internal自動分類] Customers that wants to come in office is by appointment only, inform in #mu-icd channel if there is available staff who assist the customer
- **R075** [B:internal自動分類] After 4 months of use, unpaid bills must be settled, and the device returned. Payment covers 3 consecutive months plus the COD price (based on Kintone). No 5,000 Yen cancellation f
- **R079** [B:internal自動分類] The Cancellation process should be: 1, directly input the details in Prob R, 2. update the ordersheet for the refund procedure if refund is needed
- **R098** [B:internal自動分類] (voice sim,d call sim (check kintone to confirm if the voice sim is using voice sim period billing term as its usually from order from February 21st 2022)
- **R101** [B:internal自動分類] Only applicable to these plans and it's change billing term fee: | 1. Register in ALL REQUEST- Flexible Billing Request tab
- **R104** [B:internal自動分類] C-B (6-15) → C-C (16-25) : 2,200 Yen | 4. Seller / support , attach receipt in the ALL REQUEST for update in kintone
- **R118** [B:internal自動分類] For plans that include a gift but the customer chooses not to take the gift at the time of ordering, a ¥600 discount will be applied. Prior notification and approval are required f
- **R145** [B:internal自動分類] Note: Make sure the order number in Survey Sparrow matches the one in Kintone.

## ID Acceptance

- **R162** [B:internal自動分類] 11.0 | SurveySparrow Submission Rule | Submit one Order Number per request. Multiple orders must be submitted separately.

## SPSK-SIM SITE Replacement flow

- **R257** [A:取り消し線除去] SP SIM Website | SPO_SIMPOINTxxx | https://docs.google.com/spreadsheets/d/1a5wAovZxTYVWyDRhsZ9h2nFl_lRqVRlb0hAdLi55bA8/edit?gid=0#gid=0 | SPO_SIMPOINT tab Change to SSP | Prob Item

## New Plan C and Plan SK

- **R278** [B:internal自動分類] Minimum usage: 4 months for all plans. Payment covers the next 3 months plus the COD price (based on Kintone).
- **R342** [B:internal自動分類] Note: Make sure the order number in Survey Sparrow matches the one in Kintone.

## Short Term Plan

- **R405** [B:internal自動分類] =IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""),"PUK PIN can be informed by request in ALL REQUEST (2-3 Working days is required)")

## RE-ISSUE  RULE

- **R479** [B:internal自動分類] Status in KINTONE | FINAL STATUS | Date Implemented/updated | RULES and Fees
- **R483** [B:internal自動分類] 4. Unpaid bill computation ( with no plan of continuation- same contract) = if the signal stopped less than a week in that month, unpaid bill computation will be prorated until 7th
- **R486** [B:internal自動分類] 7. Deposit fee can be allocated for discount on short term cancellation fee or reissue fee - Request in AR for the computation and registration of fees
- **R489** [B:internal自動分類] 1. Can pay via bank transfer-customer must send the receipt and report to AR
- **R490** [B:internal自動分類] 2. Can pay via smartpit- make a report to AR and request to register the fee
- **R504** [B:internal自動分類] 1. Can pay via bank transfer-customer must send the receipt and report to AR
- **R505** [B:internal自動分類] 2. Can pay via smartpit- make a report to AR and request to register the lost fee

## LOST ITEM RULES

- **R517** [B:internal自動分類] 1. Can pay via bank transfer-customer must send the receipt and report to AR
- **R518** [B:internal自動分類] 2. Can pay via smartpit- make a report to AR and request to register the lost fee

## REPLACEMENT AND CHANGE PLAN RUL

- **R531** [B:internal自動分類] 11. PUK PIN can be informed by request on ALL REQUEST (2-3 Working days is required)
- **R539** [B:internal自動分類] 19. In case of Change monthly fee from OLD PRICE to NEW PRICE with same plan , normal change plan fee exclude shipping fee will be applied , the fee can be paid via smartpit/bank t
- **R553** [B:internal自動分類] 10. Plan changes from AU UNLIMITED 5G (50GB/3 days) WiFi starting Oct. 14, 2023, to 100GB or another plan are free within 7 days if the signal does not supported. Approval needed i
- **R560** [B:internal自動分類] D-CALL | D-CALL PLAN to D-CALL PLAN is FREE, simcard does not need to change , plan change start from 1st of the following month with new bill (input in ALL REQUEST)
- **R561** [B:internal自動分類] EASY CALL | EASY-CALL PLAN to EASY-CALL PLAN is FREE , simcard does not need to change , plan change start from 1st of the following month with new bill (input in ALL REQUEST)
- **R563** [B:internal自動分類] S-CALL | S-CALL PLAN to S-CALL PLAN is 2000 yen , simcard does not need to change , plan change start from 1st of the following month with new bill (input in ALL REQUEST , 2000 nee
- **R565** [B:internal自動分類] UD-sim | UD-sim Easy call to UD-sim Easy Call, change plan fee is 1500 Yen (added to next bill), sim card does not need to change, plan change start from 1st of the following month
- **R566** [B:internal自動分類] UD-sim | UD-sim Easy call to UD-sim FREE Call, change plan fee is 1500 Yen (added to next bill), sim card does not need to change, plan change start from 1st of the following month
- **R568** [B:internal自動分類] UD-sim | Change plan request for UD-sim Easy call to UD-sim Easy Call / UD-sim Easy call to UD-sim FREE Call request must be submitted 7 days before the effective date of change pl
- **R573** [B:internal自動分類] BRASTEL | 3. Brastel plan+data sim change to data sim plan only and same GB (monthly bill will change on the following month - Request to AR, no change plan fee, No account cancell

## REFUNDDEPOSIT CASHBACK

- **R692** [A:取り消し線除去] Cashback refund processing takes 8-14 days from the date the item is received in the office.
- **R693** [B:internal自動分類] 7. Deposit fee can be allocated for discount on short term cancellation fee or reissue fee - Request in AR for the computation and registration of fees