-- Mark statutory / booklet-fixed fee amounts so the AI quotes them without the
-- "final amount confirmed by staff" disclaimer (spec v1.6 Phase 5-1, criterion 36).
-- Non-destructive: only sets fee_is_fixed=true on 101 active/customer rules whose
-- fees are a subset of {200,300,4000,5000,6800} (late fee / cancellation / re-issue /
-- SMS unit rate) and whose text contains no variable-amount words (unpaid, balance,
-- remaining, discount, cod, final, total, deposit, refund). Everything else keeps the
-- disclaimer. Staff can toggle fee_is_fixed per rule in admin.
update kb_rules set fee_is_fixed = true
where id in (
  'R038', 'R039', 'R073', 'R125', 'R126', 'R272', 'R279', 'R325', 'R393', 'R412',
  'R413', 'R492', 'P102', 'P105', 'P226', 'P417', 'P429', 'P433', 'P434', 'P494',
  'P495', 'P519', 'P520', 'P569', 'P593', 'P594', 'P611', 'P618', 'P648', 'P703',
  'P714', 'P715', 'P737', 'P738', 'P768', 'P769', 'P812', 'P813', 'P823', 'P824',
  'P874', 'P921', 'P959', 'P961', 'P992', 'P993', 'P1027', 'P1028', 'P1088', 'P1089',
  'P1090', 'P1106', 'P1107', 'P1152', 'P1153', 'P1172', 'P1173', 'P1218', 'P1219', 'P1220',
  'P1265', 'P1266', 'P1267', 'P1313', 'P1314', 'P1368', 'P1369', 'P1370', 'P1418', 'P1419',
  'P1420', 'P1461', 'P1462', 'P1479', 'P1480', 'P1520', 'P1521', 'P1522', 'P1538', 'P1539',
  'P1574', 'P1575', 'P1576', 'P1588', 'P1589', 'P1622', 'P1623', 'P1624', 'P1658', 'P1696',
  'P1728', 'P1741', 'P1776', 'P1777', 'P1874', 'P1903', 'P1941', 'P1971', 'F016', 'F020',
  'F025'
);
