// شاشة ١٩: شاشة الدفع (إضافة بطاقة) — **مش متفعّلة**.
// مافيش API لبطاقات محفوظة ولا مفاتيح بوابة دفع (Moyasar) لسه، فالشاشة دي معاينة
// للشكل بس: الحقول شغالة، لكن مافيش «حفظ» — الدفع كاش عند الاستلام حالياً.
// مابنعملش «نجاح» وهمي.
import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../widgets/common.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final _number = TextEditingController();
  final _expiry = TextEditingController();
  final _cvv = TextEditingController();
  final _name = TextEditingController();

  @override
  void dispose() {
    _number.dispose();
    _expiry.dispose();
    _cvv.dispose();
    _name.dispose();
    super.dispose();
  }

  /// أرقام البطاقة المكتوبة (بدون مسافات) — 16 رقم كحد أقصى.
  String get _digits {
    final raw = _number.text.replaceAll(RegExp(r'\D'), '');
    return raw.length > 16 ? raw.substring(0, 16) : raw;
  }

  /// «4382 •••• •••• 5511» — الفراغات نقط، والمكتوب أرقام.
  String get _numberPreview {
    final digits = _digits;
    if (digits.isEmpty) return '4382 •••• •••• 5511';

    final filled = digits.padRight(16, '•');
    return [
      for (var i = 0; i < 16; i += 4) filled.substring(i, i + 4),
    ].join(' ');
  }

  @override
  Widget build(BuildContext context) {
    final holder = _name.text.trim().isEmpty ? 'AHMED ALQADIR' : _name.text.trim().toUpperCase();
    final expiry = _expiry.text.trim().isEmpty ? '09/29' : _expiry.text.trim();

    return Scaffold(
      backgroundColor: QColors.surface,
      appBar: const QHeader(title: 'إضافة بطاقة'),
      body: ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: [
          // ── معاينة البطاقة ──
          Container(
            height: 190,
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              boxShadow: kFloatShadow,
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF1C1C1C), Color(0xFF3A3420)],
              ),
            ),
            child: Directionality(
              textDirection: TextDirection.ltr,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        width: 42,
                        height: 30,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(6),
                          gradient: const LinearGradient(
                            colors: [Color(0xFFFFD200), Color(0xFFE8A800)],
                          ),
                        ),
                      ),
                      Text(
                        'mada · VISA',
                        style: QText.num(size: 13, weight: FontWeight.w700, color: Colors.white),
                      ),
                    ],
                  ),
                  Text(
                    _numberPreview,
                    style: QText.num(size: 20, weight: FontWeight.w600, color: Colors.white)
                        .copyWith(letterSpacing: 3),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        holder,
                        style: QText.num(
                          size: 12,
                          weight: FontWeight.w600,
                          color: QColors.darkSub,
                        ),
                      ),
                      Text(
                        expiry,
                        style: QText.num(
                          size: 12,
                          weight: FontWeight.w600,
                          color: QColors.darkSub,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),

          // ── الحقول ──
          QField(
            label: 'رقم البطاقة',
            hint: '4382 1177 9032 5511',
            controller: _number,
            keyboardType: TextInputType.number,
            textDirection: TextDirection.ltr,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 18),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: QField(
                  label: 'تاريخ الانتهاء',
                  hint: '09 / 29',
                  controller: _expiry,
                  keyboardType: TextInputType.number,
                  textDirection: TextDirection.ltr,
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: QField(
                  label: 'CVV',
                  hint: '•••',
                  controller: _cvv,
                  keyboardType: TextInputType.number,
                  textDirection: TextDirection.ltr,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          QField(
            label: 'الاسم على البطاقة',
            hint: 'AHMED ALQADIR',
            controller: _name,
            textDirection: TextDirection.ltr,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 18),

          // ── مافيش حفظ: بوابة الدفع مش مربوطة ──
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: QColors.tint,
              borderRadius: BorderRadius.circular(QRadius.md),
              border: Border.all(color: QColors.tintBorder, width: 1.5),
            ),
            child: const Text(
              'ربط بوابة الدفع (Moyasar) لسه مش متفعّل — الدفع كاش عند الاستلام حالياً',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: QColors.goldDeep,
                height: 1.6,
              ),
            ),
          ),
          const SizedBox(height: 18),

          const QButton(label: 'حفظ البطاقة', enabled: false),
          const SizedBox(height: 18),

          const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '🔒 بياناتك مشفرة وآمنة بمعيار PCI-DSS',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: QColors.faint,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
