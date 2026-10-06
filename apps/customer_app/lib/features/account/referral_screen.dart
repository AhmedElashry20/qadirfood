// دعوة الأصدقاء — كود الإحالة ومشاركته، وإدخال كود غيرك.
// الكود بيتولّد على السيرفر أول مرة الشاشة تتفتح (GET /customer/referral).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../models/loyalty.dart';
import '../../providers/loyalty_provider.dart';
import '../../widgets/common.dart';

class ReferralScreen extends ConsumerWidget {
  const ReferralScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final referral = ref.watch(referralProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'ادعُ أصدقاءك'),
      body: referral.when(
        loading: () => Center(child: CircularProgressIndicator(color: QColors.brand)),
        error: (e, _) => QEmpty(message: '$e', emoji: '⚠️'),
        data: (data) => ListView(
          padding: const EdgeInsets.all(QSpace.screenH),
          children: [
            _CodeCard(data: data),
            const SizedBox(height: 14),
            _StatsCard(data: data),
            if (!data.usedReferral) ...[
              const SizedBox(height: 14),
              const _ApplyCodeCard(),
            ],
          ],
        ),
      ),
    );
  }
}

class _CodeCard extends StatelessWidget {
  const _CodeCard({required this.data});

  final ReferralInfo data;

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Column(
        children: [
          const Text('🎁', style: TextStyle(fontSize: 34)),
          const SizedBox(height: 8),
          Text(
            'اكسب ${data.rewardPoints} نقطة لكل صديق',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 16,
              fontWeight: FontWeight.w900,
              color: QColors.ink,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'يأخذ صديقك المكافأة نفسها — كلاكما بعد أول طلب يُسلَّم إليه',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: QColors.label,
              height: 1.6,
            ),
          ),
          const SizedBox(height: 14),
          // الكود بخط الأرقام ومتباعد الحروف — بيتقرا صوتياً في التليفون كتير.
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              color: QColors.tintSoft,
              borderRadius: BorderRadius.circular(QRadius.sm),
              border: Border.all(color: QColors.brand, width: 1.5),
            ),
            child: Text(
              ltr(data.code),
              textAlign: TextAlign.center,
              style: QText.num(size: 24, color: QColors.brand).copyWith(letterSpacing: 3),
            ),
          ),
          const SizedBox(height: 10),
          QButton(
            style: QButtonStyle.dark,
            label: 'نسخ الكود',
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: data.code));
              if (!context.mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('تم نسخ الكود')),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _StatsCard extends StatelessWidget {
  const _StatsCard({required this.data});

  final ReferralInfo data;

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              children: [
                Text('${data.invitedCount}', style: QText.num(size: 22, color: QColors.ink)),
                const SizedBox(height: 3),
                Text(
                  'صديق انضم',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: QColors.label,
                  ),
                ),
              ],
            ),
          ),
          Container(width: 1, height: 38, color: QColors.line),
          Expanded(
            child: Column(
              children: [
                Text(
                  '${data.invitedCount * data.rewardPoints}',
                  style: QText.num(size: 22, color: QColors.success),
                ),
                const SizedBox(height: 3),
                Text(
                  'نقطة محتملة',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: QColors.label,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// إدخال كود صديق — قبل أول طلب بس، والسيرفر هو اللي بيفرض ده.
class _ApplyCodeCard extends ConsumerStatefulWidget {
  const _ApplyCodeCard();

  @override
  ConsumerState<_ApplyCodeCard> createState() => _ApplyCodeCardState();
}

class _ApplyCodeCardState extends ConsumerState<_ApplyCodeCard> {
  final _controller = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _controller.text.trim();
    if (code.isEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(customerRepositoryProvider).applyReferral(code);
      ref.invalidate(referralProvider);
      ref.invalidate(loyaltyProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم ربط الدعوة — المكافأة بعد أول طلب')),
      );
    } on ApiException catch (e) {
      // رسالة السيرفر العربية زي ما هي: «كود إحالة غير صحيح» / «يُستخدم قبل
      // أول طلب فقط» — أوضح من أي نص عام نكتبه إحنا.
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'عندك كود صديق؟',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: QColors.ink,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'يُستخدم قبل أول طلب فقط',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: QColors.label,
            ),
          ),
          const SizedBox(height: 10),
          QField(
            controller: _controller,
            hint: 'مثال: K7M2PQR',
            textDirection: TextDirection.ltr,
            // الأكواد كلها حروف كبيرة، والسيرفر بيعمل toUpperCase برضه — بنحوّل
            // وإحنا بنكتب عشان اللي العميل شايفه يطابق اللي هيتبعت.
            inputFormatters: [UpperCaseFormatter()],
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: QColors.danger,
              ),
            ),
          ],
          const SizedBox(height: 10),
          QButton(
            label: _busy ? 'جاري التحقق…' : 'تطبيق الكود',
            enabled: !_busy,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

/// بيحوّل المدخل لحروف كبيرة وإحنا بنكتب — أكواد الإحالة كلها كابيتال.
class UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue _, TextEditingValue next) {
    return TextEditingValue(
      text: next.text.toUpperCase(),
      selection: next.selection,
      composing: TextRange.empty,
    );
  }
}
