// شاشة ١٦: الأرباح — يومي/أسبوعي/شهري + تفصيل المصادر + السحب.
//
// ✅ **كل الأرقام هنا حقيقية دلوقتي**:
//   • المجاميع وعدد الرحلات والمخطط الأسبوعي من `GET /captains/me/earnings`.
//     المتسلسلة بتيجي مصفّرة ومترتبة من السبت **ومجموعها = المجموع** بالظبط،
//     فمابنجمّعش ولا بنرتّب على الجهاز.
//   • الرصيد القابل للسحب من `GET /captains/me/wallet` (`availableToWithdraw`)
//     — مش `walletBalance`، لأن ده بيشيل طلبات السحب المعلّقة.
//   • «طلب سحب» بينادي `POST /captains/me/withdrawals` فعلاً.
//
// ℹ️ الإكراميات والمكافآت **حقول حقيقية** في تفصيل المصادر بس قيمتها صفر لحد ما
// حاجة تكتب حركات `TIP` / `BONUS` في المحفظة. عشان كده بنعرض صفر مع ملاحظة
// صغيرة — مش «—» زي زمان، لأن الرقم بقى معروف مش غايب.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/format.dart' as fmt;
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../data/captain_repository.dart';
import '../../models/earnings.dart';
import '../../models/wallet.dart';
import '../../providers/captain_status_provider.dart';
import '../../providers/earnings_provider.dart';
import '../../widgets/common.dart';

class EarningsScreen extends ConsumerWidget {
  const EarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final range = ref.watch(earningsRangeProvider);
    final earningsAsync = ref.watch(earningsProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      body: RefreshIndicator(
        color: QColors.ink,
        onRefresh: () async {
          ref.invalidate(earningsByRangeProvider);
          ref.invalidate(walletProvider);
          // للكابتن التابع لشركة: الهيرو بيعرض توزيعات الشركة بدل رصيد المحفظة.
          ref.invalidate(distributionsProvider);
          await ref.read(earningsProvider.future);
        },
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            const _Hero(),
            Padding(
              padding: const EdgeInsets.all(QSpace.screenH),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _PeriodTrio(
                    selected: range,
                    onSelect: (value) => ref.read(earningsRangeProvider.notifier).select(value),
                  ),
                  const SizedBox(height: 14),
                  earningsAsync.when(
                    loading: () => const Padding(
                      padding: EdgeInsets.symmetric(vertical: 60),
                      child: QLoading(),
                    ),
                    error: (error, _) => QErrorView(
                      message: error is ApiException ? error.message : 'مش قادرين نجيب الأرباح',
                      onRetry: () => ref.invalidate(earningsByRangeProvider),
                    ),
                    data: (summary) => Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _WeeklyChart(summary: summary),
                        const SizedBox(height: 14),
                        _BreakdownCard(summary: summary),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// الهيرو الأسود — الرصيد القابل للسحب + السحب وكشف الحساب.
class _Hero extends ConsumerWidget {
  const _Hero();

  Future<void> _openWithdrawal(BuildContext context, WidgetRef ref, Wallet wallet) async {
    if (!wallet.hasPayoutMethods) {
      _snack(context, 'ضيف حساب استلام الأول من المحفظة');
      return;
    }

    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _WithdrawalSheet(wallet: wallet),
    );

    if (created != true || !context.mounted) return;
    ref.invalidate(walletProvider);
    ref.invalidate(withdrawalsProvider);
    _snack(context, 'تم إرسال طلب السحب');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final captain = ref.watch(captainProvider).valueOrNull;
    final isCompany = captain?.isCompanyCaptain ?? false;

    // الكابتن التابع لشركة مالوش محفظة منصة — مانناديش walletProvider أصلاً.
    final walletAsync = isCompany ? null : ref.watch(walletProvider);
    final wallet = walletAsync?.valueOrNull;

    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: QColors.ink,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 16, QSpace.screenH, 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const QBackButton(onDark: true),
                  const SizedBox(width: 12),
                  Text('الأرباح', style: QText.screenTitle.copyWith(color: Colors.white)),
                ],
              ),
              const SizedBox(height: 18),
              // company captain → شركته بتدفعله؛ بنعرض بانر التوزيعات بدل رصيد السحب.
              if (isCompany)
                _CompanyEarningsBanner(companyName: captain!.companyName!)
              else ...[
                const Text(
                  'رصيدك القابل للسحب',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: QColors.darkSub,
                  ),
                ),
                const SizedBox(height: 6),
                walletAsync!.when(
                loading: () => QLtr(
                  child: Text(
                    '…',
                    style: QText.num(size: 30, weight: FontWeight.w800, color: QColors.darkSub),
                  ),
                ),
                error: (error, _) => Text(
                  error is ApiException ? error.message : 'مش قادرين نجيب الرصيد',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: QColors.dangerOnDark,
                  ),
                ),
                data: (value) => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    QPrice(value: value.availableToWithdraw, size: 30, color: Colors.white),
                    // المحجوز لسه في الرصيد الكلي — بنوضّح الفرق عشان مايحصلش لبس.
                    if (value.hasPending) ...[
                      const SizedBox(height: 4),
                      Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: fmt.ltr(fmt.money(value.pendingWithdrawals)),
                              style: QText.num(size: 11.5, color: QColors.gold),
                            ),
                            const TextSpan(text: ' ر.س تحت المراجعة'),
                          ],
                        ),
                        style: const TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: QColors.darkFooter,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: QButton(
                      label: 'طلب سحب 💸',
                      compact: true,
                      enabled: wallet != null && wallet.canWithdraw,
                      onPressed:
                          wallet == null ? null : () => _openWithdrawal(context, ref, wallet),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _DarkButton(
                      label: 'كشف الحساب',
                      onTap: () => context.push(QRoutes.wallet),
                    ),
                  ),
                ],
              ),
              // سبب وقف زرار السحب — أوضح من زرار رمادي من غير تفسير.
              if (wallet != null && !wallet.canWithdraw) ...[
                const SizedBox(height: 8),
                Text(
                  wallet.hasPayoutMethods
                      ? 'أقل مبلغ للسحب ${fmt.ltr(fmt.money(Wallet.minWithdrawal))} ر.س'
                      : 'ضيف حساب استلام من المحفظة عشان تقدر تسحب',
                  style: const TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: QColors.darkFooter,
                  ),
                ),
              ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// شيت طلب السحب — بيرجّع `true` لو الطلب اتبعت.
class _WithdrawalSheet extends ConsumerStatefulWidget {
  const _WithdrawalSheet({required this.wallet});

  final Wallet wallet;

  @override
  ConsumerState<_WithdrawalSheet> createState() => _WithdrawalSheetState();
}

class _WithdrawalSheetState extends ConsumerState<_WithdrawalSheet> {
  final _amount = TextEditingController();

  late String _methodId = _defaultMethodId;
  bool _sending = false;

  /// الحساب الأساسي لو موجود، وإلا أول واحد.
  String get _defaultMethodId {
    final methods = widget.wallet.payoutMethods;
    return methods.firstWhere((m) => m.isDefault, orElse: () => methods.first).id;
  }

  /// مبالغ سريعة — بنشيل اللي أكبر من المتاح عشان مانعرضش اختيار هيترفض.
  List<double> get _quickAmounts =>
      [50.0, 100.0, 250.0].where((v) => v <= widget.wallet.availableToWithdraw).toList();

  double get _typedAmount => double.tryParse(_amount.text.trim()) ?? 0;

  bool get _isValid =>
      _typedAmount >= Wallet.minWithdrawal && _typedAmount <= widget.wallet.availableToWithdraw;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  void _fill(double value) {
    // fmt.money بيشيل الأصفار الزايدة فالحقل يفضل نضيف.
    _amount.text = fmt.money(value);
    setState(() {});
  }

  Future<void> _submit() async {
    setState(() => _sending = true);

    try {
      await ref.read(captainRepositoryProvider).createWithdrawal(
            amount: _typedAmount,
            payoutMethodId: _methodId,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      // رسائل السيرفر بالعربي جاهزة: «الحد الأدنى للسحب ٥٠ ر.س» / «الرصيد
      // المتاح أقل من المبلغ المطلوب» / «حساب الاستلام غير موجود».
      if (!mounted) return;
      setState(() => _sending = false);
      _snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final available = widget.wallet.availableToWithdraw;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 18, QSpace.screenH, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('طلب سحب', style: QText.section),
              const SizedBox(height: 4),
              Text.rich(
                TextSpan(
                  text: 'المتاح ',
                  children: [
                    TextSpan(
                      text: fmt.ltr(fmt.money(available)),
                      style: QText.num(size: 12.5, color: QColors.ink),
                    ),
                    const TextSpan(text: ' ر.س'),
                  ],
                ),
                style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 14),
              QField(
                label: 'المبلغ',
                hint: '${fmt.ltr(fmt.money(Wallet.minWithdrawal))} ر.س على الأقل',
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                textDirection: TextDirection.ltr,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  for (final value in _quickAmounts) ...[
                    QChip(label: fmt.money(value), onTap: () => _fill(value)),
                    const SizedBox(width: 8),
                  ],
                  QChip(
                    label: 'سحب الكل',
                    selected: _typedAmount == available && available > 0,
                    onTap: () => _fill(available),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Text('يتحوّل على', style: QText.fieldLabel),
              const SizedBox(height: 8),
              QTileGroup(
                children: [
                  for (final method in widget.wallet.payoutMethods)
                    QListTile(
                      emoji: method.destination.emoji,
                      title: method.label,
                      subtitle: method.accountRef,
                      showChevron: false,
                      onTap: () => setState(() => _methodId = method.id),
                      trailing: QRadioDot(selected: _methodId == method.id),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: QButton(
                  label: 'أكّد طلب السحب',
                  enabled: _isValid,
                  loading: _sending,
                  onPressed: _submit,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'المبلغ بيتحجز من رصيدك دلوقتي وبيتحوّل بعد موافقة الإدارة',
                textAlign: TextAlign.center,
                style: QText.tiny.copyWith(color: QColors.faint, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// زرار ثانوي فوق الأسود — QButton مالوش نسخة inkSoft.
class _DarkButton extends StatelessWidget {
  const _DarkButton({required this.label, this.onTap});

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: QColors.inkSoft,
      borderRadius: BorderRadius.circular(QRadius.lg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(QRadius.lg),
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Text(
            label,
            style: QText.button.copyWith(fontSize: 14.5, color: Colors.white),
          ),
        ),
      ),
    );
  }
}

/// بانر الكابتن التابع لشركة — بديل «رصيدك القابل للسحب» في الهيرو الأسود.
///
/// شركته بتدفعله مش المنصة، فمافيش رصيد سحب. بنعرض اسم الشركة + المدفوع/المستحق
/// من `distributionsProvider` + زرار يودّي لتفاصيل التوزيعات (شاشة المحفظة).
class _CompanyEarningsBanner extends ConsumerWidget {
  const _CompanyEarningsBanner({required this.companyName});

  final String companyName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(distributionsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'أرباحك عن طريق',
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: QColors.darkSub,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          companyName,
          style: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 22,
            fontWeight: FontWeight.w900,
            color: QColors.brand,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'شركتك هي اللي بتدفعلك مش المنصة — عشان كده مافيش رصيد ولا سحب هنا.',
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
            color: QColors.darkFooter,
            height: 1.5,
          ),
        ),
        const SizedBox(height: 14),
        async.when(
          loading: () => QLtr(
            child: Text('…', style: QText.num(size: 22, color: QColors.darkSub)),
          ),
          error: (error, _) => Text(
            error is ApiException ? error.message : 'مش قادرين نجيب التوزيعات',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: QColors.dangerOnDark,
            ),
          ),
          data: (data) => Row(
            children: [
              Expanded(
                child: _CompanyStat(
                  label: 'الشركة دفعتلك',
                  value: data.totalPaid,
                  color: QColors.online,
                ),
              ),
              Container(width: 1, height: 40, color: QColors.inkLine),
              Expanded(
                child: _CompanyStat(
                  label: 'مستحق على الشركة',
                  value: data.totalPending,
                  color: QColors.gold,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: _DarkButton(
            label: 'تفاصيل توزيعات الشركة',
            onTap: () => context.push(QRoutes.wallet),
          ),
        ),
      ],
    );
  }
}

/// مبلغ + عنوان فوق الهيرو الأسود — بيعرض «ر.س» عشان الرقم يبان واضح.
class _CompanyStat extends StatelessWidget {
  const _CompanyStat({required this.label, required this.value, required this.color});

  final String label;
  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        QPrice(value: value, size: 18, color: color),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            color: QColors.darkSub,
          ),
        ),
      ],
    );
  }
}

/// اليوم / الأسبوع / الشهر — كل واحدة نداء مستقل بكاش خاص بيها.
class _PeriodTrio extends ConsumerWidget {
  const _PeriodTrio({required this.selected, required this.onSelect});

  final EarningsRange selected;
  final ValueChanged<EarningsRange> onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Row(
      children: [
        for (final range in EarningsRange.values) ...[
          Expanded(
            child: QCard(
              onTap: () => onSelect(range),
              highlighted: range == selected,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
              child: Column(
                children: [
                  Text(range.ar, style: QText.tiny.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  ref.watch(earningsByRangeProvider(range)).when(
                        loading: () => QLtr(
                          child: Text(
                            '…',
                            style: QText.num(size: 17, color: QColors.faint),
                          ),
                        ),
                        error: (_, __) => QLtr(
                          child: Text('—', style: QText.num(size: 17, color: QColors.faint)),
                        ),
                        data: (summary) => Column(
                          children: [
                            QLtr(
                              child: Text(
                                fmt.money(summary.rangeTotal),
                                style: QText.num(size: 17, weight: FontWeight.w800),
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text.rich(
                              TextSpan(
                                children: [
                                  TextSpan(
                                    text: fmt.ltr('${summary.rangeOrders}'),
                                    style: QText.num(
                                      size: 11,
                                      weight: FontWeight.w700,
                                      color: QColors.faint,
                                    ),
                                  ),
                                  const TextSpan(text: ' طلب'),
                                ],
                              ),
                              style: QText.tiny.copyWith(fontSize: 11, color: QColors.faint),
                            ),
                          ],
                        ),
                      ),
                ],
              ),
            ),
          ),
          if (range != EarningsRange.values.last) const SizedBox(width: 10),
        ],
      ],
    );
  }
}

/// مخطط الأسبوع — أعمدة بسيطة من `dailySeries` (مافيش مكتبة رسم في المشروع).
class _WeeklyChart extends StatelessWidget {
  const _WeeklyChart({required this.summary});

  final EarningsSummary summary;

  @override
  Widget build(BuildContext context) {
    final series = summary.dailySeries;
    final peak = summary.maxDaily;
    final allZero = series.every((bar) => bar.value <= 0);

    return QCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('توزيع ${summary.range.ar}', style: QText.section.copyWith(fontSize: 14)),
          const SizedBox(height: 14),
          if (series.isEmpty || allZero)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 18),
              child: Center(
                child: Text(
                  'مافيش طلبات مسلّمة في الفترة دي',
                  style: QText.tiny.copyWith(color: QColors.faint, fontWeight: FontWeight.w600),
                ),
              ),
            )
          else
            SizedBox(
              height: 132,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final bar in series)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 3),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            // أعلى يوم بالبراند والباقي رمادي — نفس التصميم.
                            Container(
                              height: (bar.value / peak * 96).clamp(4, 96).toDouble(),
                              decoration: BoxDecoration(
                                color: bar.value >= peak && bar.value > 0
                                    ? QColors.brand
                                    : QColors.barIdle,
                                borderRadius: const BorderRadius.vertical(top: Radius.circular(7)),
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              bar.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontFamily: 'Cairo',
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: QColors.label,
                              ),
                            ),
                          ],
                        ),
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

/// تفصيل المصادر — التلاتة حقيقيين، بس الإكرامية والمكافأة لسه صفر.
class _BreakdownCard extends StatelessWidget {
  const _BreakdownCard({required this.summary});

  final EarningsSummary summary;

  @override
  Widget build(BuildContext context) {
    final breakdown = summary.breakdown;

    return QCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('تفصيل ${summary.range.ar}', style: QText.section.copyWith(fontSize: 14)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(text: 'أجرة التوصيل ('),
                      TextSpan(
                        text: fmt.ltr('${summary.rangeOrders}'),
                        style: QText.num(size: 13, weight: FontWeight.w700),
                      ),
                      const TextSpan(text: ' طلب)'),
                    ],
                  ),
                  style: QText.body.copyWith(fontSize: 13.5),
                ),
              ),
              QPrice(value: breakdown.deliveryFees, size: 15),
            ],
          ),
          const Divider(color: QColors.line, height: 20),
          _AmountRow(
            label: 'إكراميات',
            value: breakdown.tips ?? 0,
            note: (breakdown.tips ?? 0) == 0 ? 'مافيش إكراميات لسه' : null,
          ),
          const Divider(color: QColors.line, height: 20),
          _AmountRow(
            label: 'مكافآت',
            value: breakdown.bonus ?? 0,
            note: (breakdown.bonus ?? 0) == 0 ? 'مافيش مكافآت لسه' : null,
          ),
          const Divider(color: QColors.line, height: 20),
          Row(
            children: [
              Expanded(
                child: Text(
                  'متوسط الرحلة',
                  style: QText.body.copyWith(fontSize: 13.5, color: QColors.textMuted),
                ),
              ),
              QPrice(value: summary.averagePerOrder, size: 14, color: QColors.textMuted),
            ],
          ),
        ],
      ),
    );
  }
}

/// صف مبلغ حقيقي — الصفر هنا معناه «مافيش» مش «مش معروف».
class _AmountRow extends StatelessWidget {
  const _AmountRow({required this.label, required this.value, this.note});

  final String label;
  final double value;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final zero = value == 0;

    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: QText.body.copyWith(
                  fontSize: 13.5,
                  color: zero ? QColors.textMuted : QColors.ink,
                ),
              ),
              if (note != null) ...[
                const SizedBox(height: 2),
                Text(note!, style: QText.tiny.copyWith(fontSize: 11, color: QColors.faint)),
              ],
            ],
          ),
        ),
        QPrice(value: value, size: 15, color: zero ? QColors.faint : QColors.ink),
      ],
    );
  }
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: QColors.ink,
        behavior: SnackBarBehavior.floating,
        content: Text(
          message,
          style: QText.body.copyWith(fontSize: 14, color: QColors.brand),
        ),
      ),
    );
}
