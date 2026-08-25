// شاشة ١٧: المحفظة والتحويلات.
//
// ✅ **الشاشة دي بقت حقيقية بالكامل**:
//   • الرصيد والمحجوز والقابل للسحب من `GET /captains/me/wallet`.
//   • حسابات الاستلام: قراءة وإضافة وحذف (`/captains/me/payout-methods`).
//   • كشف الحساب من `GET /captains/me/wallet/transactions` — مرقّم، الأحدث الأول.
//   • طلبات السحب من `GET /captains/me/withdrawals` بحالاتها وأسباب الرفض.
//
// ⚠️ نقطة مهمة في قراءة الأرقام: **الرصيد مابيتخصمش وقت طلب السحب**. الطلب
// بيتحجز حسابياً (`pendingWithdrawals` بيزيد و `availableToWithdraw` بيقل) والخصم
// الفعلي بيحصل عند موافقة الأدمن. عشان كده بنعرض التلات أرقام مع بعض بدل رقم واحد.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart' as fmt;
import '../../core/theme.dart';
import '../../data/captain_repository.dart';
import '../../models/distributions.dart';
import '../../models/wallet.dart';
import '../../providers/captain_status_provider.dart';
import '../../providers/earnings_provider.dart';
import '../../widgets/common.dart';

class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  /// عدد صفحات كشف الحساب المحمّلة — كل صفحة provider لوحدها وبنكوّمهم.
  int _pages = 1;

  Future<void> _refresh() async {
    ref.invalidate(captainProvider);
    ref.invalidate(distributionsProvider);
    ref.invalidate(walletProvider);
    ref.invalidate(withdrawalsProvider);
    ref.invalidate(walletTransactionsProvider);
    setState(() => _pages = 1);
    // captainProvider بيحدّد أي شاشة نعرض (محفظة/توزيعات) فبنستناه هو.
    await ref.read(captainProvider.future);
  }

  /// إضافة حساب استلام جديد.
  Future<void> _addPayoutMethod() async {
    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AddPayoutMethodSheet(),
    );

    if (added == true && mounted) {
      ref.invalidate(walletProvider);
    }
  }

  /// حذف حساب استلام — بتأكيد الأول.
  Future<void> _deletePayoutMethod(PayoutMethod method) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: QColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(QRadius.xl)),
        title: const Text('حذف الحساب', style: QText.section),
        content: Text(
          'متأكد إنك عايز تحذف «${method.label}»؟',
          style: QText.bodyMuted,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text('رجوع', style: QText.body.copyWith(fontSize: 14)),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(
              'حذف',
              style: QText.body.copyWith(fontSize: 14, color: QColors.danger),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ref.read(captainRepositoryProvider).deletePayoutMethod(method.id);
      if (!mounted) return;
      ref.invalidate(walletProvider);
      _snack(context, 'تم حذف الحساب');
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final captainAsync = ref.watch(captainProvider);
    final isCompany = captainAsync.valueOrNull?.isCompanyCaptain ?? false;

    return Scaffold(
      backgroundColor: QColors.canvas,
      // الكابتن التابع لشركة مالوش محفظة منصة — العنوان بيوضّح إنها مدفوعات الشركة.
      appBar: QHeader(title: isCompany ? 'مدفوعات الشركة' : 'المحفظة'),
      body: RefreshIndicator(
        color: QColors.ink,
        onRefresh: _refresh,
        child: captainAsync.when(
          loading: () => const QLoading(),
          error: (error, _) => ListView(
            children: [
              const SizedBox(height: 80),
              QErrorView(
                message: error is ApiException ? error.message : 'مش قادرين نجيب بياناتك',
                onRetry: () => ref.invalidate(captainProvider),
              ),
            ],
          ),
          // company captain → توزيعات الشركة · independent → محفظة المنصة زي ما هي.
          data: (captain) => captain.isCompanyCaptain
              ? _CompanyDistributionsView(companyName: captain.companyName!)
              : _platformWallet(),
        ),
      ),
    );
  }

  /// محفظة المنصة — للكابتن المستقل بس. الرصيد + حسابات الاستلام + السحب + كشف الحساب.
  /// نفس الشاشة القديمة بالظبط — مانلمسش تدفق الكابتن المستقل.
  Widget _platformWallet() {
    final walletAsync = ref.watch(walletProvider);

    return walletAsync.when(
      loading: () => const QLoading(),
      error: (error, _) => ListView(
        children: [
          const SizedBox(height: 80),
          QErrorView(
            message: error is ApiException ? error.message : 'مش قادرين نجيب المحفظة',
            onRetry: () => ref.invalidate(walletProvider),
          ),
        ],
      ),
      data: (wallet) => ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: [
          _BalanceCard(wallet: wallet),
          const SizedBox(height: 20),
          _PayoutMethodsSection(
            methods: wallet.payoutMethods,
            onAdd: _addPayoutMethod,
            onDelete: _deletePayoutMethod,
          ),
          const SizedBox(height: 20),
          const _WithdrawalsSection(),
          const SizedBox(height: 20),
          _LedgerSection(
            pages: _pages,
            onLoadMore: () => setState(() => _pages++),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────── الرصيد ───────────────────────────

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.wallet});

  final Wallet wallet;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
      decoration: BoxDecoration(
        color: QColors.ink,
        borderRadius: BorderRadius.circular(QRadius.xl),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'رصيد المحفظة',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: QColors.darkSub,
            ),
          ),
          const SizedBox(height: 6),
          QPrice(value: wallet.balance, size: 30, color: Colors.white),
          const SizedBox(height: 16),
          const Divider(color: QColors.inkLine, height: 1),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _MiniStat(
                  label: 'محجوز للسحب',
                  value: wallet.pendingWithdrawals,
                  color: QColors.gold,
                ),
              ),
              Container(width: 1, height: 34, color: QColors.inkLine),
              Expanded(
                child: _MiniStat(
                  label: 'متاح للسحب',
                  value: wallet.availableToWithdraw,
                  color: QColors.brand,
                ),
              ),
            ],
          ),
          if (wallet.hasPending) ...[
            const SizedBox(height: 12),
            Text(
              'المبلغ المحجوز لسه في رصيدك — بيتخصم بعد موافقة الإدارة',
              style: QText.tiny.copyWith(
                fontSize: 11,
                color: QColors.darkFooter,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value, required this.color});

  final String label;
  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        QLtr(child: Text(fmt.money(value), style: QText.num(size: 17, color: color))),
        const SizedBox(height: 3),
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

// ─────────────────────────── توزيعات الشركة ───────────────────────────
//
// للكابتن التابع لشركة أسطول بس: شركته بتدفعله مش المنصة، فمافيش محفظة ولا سحب.
// بنعرض بدلها اللي الشركة سجّلته مستحق/مدفوع + قايمة التسويات. الأرقام دي هي اللي
// الشركة سجّلته — حركة الفلوس الفعلية بين الشركة والكابتن **برّه المنصة**.

class _CompanyDistributionsView extends ConsumerWidget {
  const _CompanyDistributionsView({required this.companyName});

  final String companyName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(distributionsProvider);

    return async.when(
      loading: () => const QLoading(),
      error: (error, _) => ListView(
        children: [
          const SizedBox(height: 80),
          QErrorView(
            message: error is ApiException ? error.message : 'مش قادرين نجيب توزيعات الشركة',
            onRetry: () => ref.invalidate(distributionsProvider),
          ),
        ],
      ),
      data: (data) => ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: [
          _CompanyHeaderCard(companyName: companyName, data: data),
          const SizedBox(height: 20),
          Text('توزيعات الشركة', style: QText.section.copyWith(fontSize: 14)),
          const SizedBox(height: 8),
          if (data.isEmpty)
            const QCard(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: QEmpty(
                message: 'لسه مفيش توزيعات — أول ما شركتك تتحاسب هتبان هنا',
                emoji: '🏢',
              ),
            )
          else
            QCard(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              child: Column(
                children: [
                  for (var i = 0; i < data.distributions.length; i++) ...[
                    if (i != 0) const Divider(color: QColors.line, height: 1),
                    _DistributionRow(dist: data.distributions[i]),
                  ],
                ],
              ),
            ),
          const SizedBox(height: 14),
          // تنويه أمانة: دي أرقام الشركة، مش حركة على المنصة.
          Text(
            'التوزيعات دي بتوضّح اللي شركتك سجّلته مستحق أو مدفوع ليك. تحويل الفلوس '
            'الفعلي بيتم بين الشركة وبينك برّه المنصة.',
            style: QText.tiny.copyWith(fontSize: 11, color: QColors.faint, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// كارت أسود بأسلوب [_BalanceCard]: اسم الشركة + شرح إنها بتدفعله + المدفوع/المستحق.
class _CompanyHeaderCard extends StatelessWidget {
  const _CompanyHeaderCard({required this.companyName, required this.data});

  final String companyName;
  final CaptainDistributions data;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
      decoration: BoxDecoration(
        color: QColors.ink,
        borderRadius: BorderRadius.circular(QRadius.xl),
      ),
      child: Column(
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
          const SizedBox(height: 6),
          Text(
            companyName,
            style: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: QColors.brand,
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'شركتك هي اللي بتدفعلك — مش المنصة. عشان كده مافيش محفظة ولا سحب من هنا؛ '
            'المنصة بتحاسب شركتك وهي بتوزّع عليك.',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: QColors.darkFooter,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 16),
          const Divider(color: QColors.inkLine, height: 1),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _DarkMoneyStat(
                  label: 'الشركة دفعتلك',
                  value: data.totalPaid,
                  color: QColors.online,
                ),
              ),
              Container(width: 1, height: 40, color: QColors.inkLine),
              Expanded(
                child: _DarkMoneyStat(
                  label: 'مستحق على الشركة',
                  value: data.totalPending,
                  color: QColors.gold,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// مبلغ + عنوان فوق خلفية سودا — بيعرض «ر.س» عشان الرقم يبان واضح مالوش لبس.
class _DarkMoneyStat extends StatelessWidget {
  const _DarkMoneyStat({required this.label, required this.value, required this.color});

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

/// صف تسوية واحدة — الفترة وعدد الرحلات والمبلغ وشريحة الحالة. المدفوع بيوضّح
/// المرجع وتاريخ الدفع.
class _DistributionRow extends StatelessWidget {
  const _DistributionRow({required this.dist});

  final CompanyDistribution dist;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              QPrice(value: dist.amount, size: 15),
              const SizedBox(width: 10),
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: fmt.ltr('${dist.tripCount}'),
                        style: QText.num(size: 12.5, weight: FontWeight.w700, color: QColors.label),
                      ),
                      const TextSpan(text: ' رحلة'),
                    ],
                  ),
                  style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: dist.status.chipColor,
                  borderRadius: BorderRadius.circular(QRadius.pill),
                ),
                child: Text(
                  dist.status.ar,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: dist.status.color,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'فترة حتى ${_shortDate(dist.periodEnd)}',
            style: QText.tiny.copyWith(fontSize: 11, color: QColors.faint),
          ),
          // تفاصيل الدفع — بتبان لما الشركة تكون دفعت التسوية.
          if (dist.isPaid) ...[
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: QColors.successTint,
                borderRadius: BorderRadius.circular(QRadius.sm),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (dist.paidAt != null)
                    Text.rich(
                      TextSpan(
                        children: [
                          const TextSpan(text: 'دفعتها الشركة في '),
                          TextSpan(
                            text: _shortDate(dist.paidAt),
                            style: QText.num(size: 11.5, weight: FontWeight.w700, color: QColors.success),
                          ),
                        ],
                      ),
                      style: QText.tiny.copyWith(fontSize: 11.5, color: QColors.success),
                    ),
                  if (dist.hasReference) ...[
                    if (dist.paidAt != null) const SizedBox(height: 2),
                    Text.rich(
                      TextSpan(
                        children: [
                          const TextSpan(text: 'مرجع الدفع: '),
                          TextSpan(
                            text: fmt.ltr(dist.reference!),
                            style: QText.num(size: 11.5, weight: FontWeight.w700, color: QColors.success),
                          ),
                        ],
                      ),
                      style: QText.tiny.copyWith(fontSize: 11.5, color: QColors.success),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// «٢١/٧/٢٠٢٦» معزول bidi — للفترة وتاريخ الدفع.
String _shortDate(DateTime? value) {
  if (value == null) return '—';
  return fmt.ltr('${value.day}/${value.month}/${value.year}');
}

// ─────────────────────────── حسابات الاستلام ───────────────────────────

class _PayoutMethodsSection extends StatelessWidget {
  const _PayoutMethodsSection({
    required this.methods,
    required this.onAdd,
    required this.onDelete,
  });

  final List<PayoutMethod> methods;
  final VoidCallback onAdd;
  final ValueChanged<PayoutMethod> onDelete;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text('حسابات الاستلام', style: QText.section.copyWith(fontSize: 14))),
            InkWell(
              onTap: onAdd,
              borderRadius: BorderRadius.circular(QRadius.pill),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                decoration: BoxDecoration(
                  color: QColors.brand,
                  borderRadius: BorderRadius.circular(QRadius.pill),
                ),
                child: const Text(
                  '+ إضافة حساب',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12.5,
                    fontWeight: FontWeight.w900,
                    color: QColors.ink,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (methods.isEmpty)
          const QCard(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: QEmpty(message: 'مافيش حسابات — ضيف حساب عشان تقدر تسحب', emoji: '🏦'),
          )
        else
          QTileGroup(
            children: [
              for (final method in methods)
                QListTile(
                  emoji: method.destination.emoji,
                  title: method.label,
                  // `accountRef` بيرجع مقنّع من السيرفر — مافيش نسخة كاملة نعرضها.
                  subtitle: method.accountRef,
                  showChevron: false,
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (method.isDefault) ...[
                        const QBadge(label: 'الأساسي'),
                        const SizedBox(width: 8),
                      ],
                      InkWell(
                        onTap: () => onDelete(method),
                        borderRadius: BorderRadius.circular(QRadius.sm),
                        child: const Padding(
                          padding: EdgeInsets.all(6),
                          child: Icon(Icons.delete_outline, size: 19, color: QColors.danger),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

/// شيت إضافة حساب استلام — بيرجّع `true` لو الإضافة نجحت.
class _AddPayoutMethodSheet extends ConsumerStatefulWidget {
  const _AddPayoutMethodSheet();

  @override
  ConsumerState<_AddPayoutMethodSheet> createState() => _AddPayoutMethodSheetState();
}

class _AddPayoutMethodSheetState extends ConsumerState<_AddPayoutMethodSheet> {
  final _label = TextEditingController();
  final _accountRef = TextEditingController();

  PayoutDestination _destination = PayoutDestination.bank;
  bool _saving = false;

  @override
  void dispose() {
    _label.dispose();
    _accountRef.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);

    try {
      await ref.read(captainRepositoryProvider).addPayoutMethod(
            destination: _destination.wire,
            label: _label.text.trim(),
            accountRef: _accountRef.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ready = _label.text.trim().isNotEmpty && _accountRef.text.trim().length >= 6;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 18, QSpace.screenH, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('إضافة حساب استلام', style: QText.section),
              const SizedBox(height: 14),
              Row(
                children: [
                  for (final destination in PayoutDestination.values) ...[
                    QChip(
                      label: '${destination.emoji} ${destination.ar}',
                      selected: _destination == destination,
                      onTap: () => setState(() => _destination = destination),
                    ),
                    const SizedBox(width: 8),
                  ],
                ],
              ),
              const SizedBox(height: 14),
              QField(
                label: 'اسم الجهة',
                hint: _destination == PayoutDestination.bank ? 'بنك الراجحي' : 'stc pay',
                controller: _label,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 12),
              QField(
                label: _destination == PayoutDestination.bank ? 'الآيبان' : 'رقم الجوال',
                hint: _destination == PayoutDestination.bank ? 'SA00 0000 0000 0000' : '05XXXXXXXX',
                controller: _accountRef,
                textDirection: TextDirection.ltr,
                keyboardType: TextInputType.text,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 8),
              Text(
                'البيانات بتتخزّن كاملة على السيرفر وبترجع مقنّعة دايماً',
                style: QText.tiny.copyWith(color: QColors.faint, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: QButton(
                  label: 'حفظ الحساب',
                  enabled: ready,
                  loading: _saving,
                  onPressed: _save,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────── طلبات السحب ───────────────────────────

class _WithdrawalsSection extends ConsumerWidget {
  const _WithdrawalsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final withdrawalsAsync = ref.watch(withdrawalsProvider(1));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('طلبات السحب', style: QText.section.copyWith(fontSize: 14)),
        const SizedBox(height: 8),
        withdrawalsAsync.when(
          loading: () => const QCard(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: QLoading(),
          ),
          error: (error, _) => QCard(
            child: Text(
              error is ApiException ? error.message : 'مش قادرين نجيب طلبات السحب',
              style: QText.bodyMuted,
            ),
          ),
          data: (page) => page.data.isEmpty
              ? const QCard(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: QEmpty(message: 'مافيش طلبات سحب لسه', emoji: '💸'),
                )
              : QCard(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                  child: Column(
                    children: [
                      for (var i = 0; i < page.data.length; i++) ...[
                        if (i != 0) const Divider(color: QColors.line, height: 1),
                        _WithdrawalRow(request: page.data[i]),
                      ],
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

class _WithdrawalRow extends StatelessWidget {
  const _WithdrawalRow({required this.request});

  final WithdrawalRequest request;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              QPrice(value: request.amount, size: 15),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '${request.destination.ar} · ${request.destinationRef}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: request.status.chipColor,
                  borderRadius: BorderRadius.circular(QRadius.pill),
                ),
                child: Text(
                  request.statusLabel,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: request.status.color,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            _relativeDate(request.createdAt),
            style: QText.tiny.copyWith(fontSize: 11, color: QColors.faint),
          ),
          // سبب الرفض إلزامي على السيرفر وقت الرفض — بنعرضه كامل.
          if (request.isRejected && request.rejectReason != null) ...[
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: QColors.dangerBorder,
                borderRadius: BorderRadius.circular(QRadius.sm),
              ),
              child: Text(
                request.rejectReason!,
                style: QText.tiny.copyWith(fontSize: 11.5, color: QColors.danger),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ─────────────────────────── كشف الحساب ───────────────────────────

class _LedgerSection extends ConsumerWidget {
  const _LedgerSection({required this.pages, required this.onLoadMore});

  final int pages;
  final VoidCallback onLoadMore;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // بنكوّم الصفحات المحمّلة — كل صفحة provider مستقل بكاش خاص بيها.
    final loaded = <WalletTransaction>[];
    var total = 0;
    var loading = false;
    Object? failure;

    for (var page = 1; page <= pages; page++) {
      final async = ref.watch(walletTransactionsProvider(page));
      if (async.isLoading) loading = true;
      if (async.hasError) failure = async.error;

      final value = async.valueOrNull;
      if (value != null) {
        loaded.addAll(value.data);
        total = value.total;
      }
    }

    final error = failure;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('كشف الحساب', style: QText.section.copyWith(fontSize: 14)),
        const SizedBox(height: 8),
        if (error != null && loaded.isEmpty)
          QCard(
            child: Text(
              error is ApiException ? error.message : 'مش قادرين نجيب الحركات',
              style: QText.bodyMuted,
            ),
          )
        else if (loading && loaded.isEmpty)
          const QCard(padding: EdgeInsets.symmetric(vertical: 24), child: QLoading())
        else if (loaded.isEmpty)
          const QCard(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: QEmpty(message: 'مافيش حركات لسه', emoji: '💳'),
          )
        else ...[
          QCard(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Column(
              children: [
                for (var i = 0; i < loaded.length; i++) ...[
                  if (i != 0) const Divider(color: QColors.line, height: 1),
                  _TransactionRow(transaction: loaded[i]),
                ],
              ],
            ),
          ),
          if (loaded.length < total) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: QButton(
                label: 'عرض المزيد',
                style: QButtonStyle.outline,
                compact: true,
                loading: loading,
                onPressed: onLoadMore,
              ),
            ),
          ],
        ],
      ],
    );
  }
}

class _TransactionRow extends StatelessWidget {
  const _TransactionRow({required this.transaction});

  final WalletTransaction transaction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  transaction.type.ar,
                  style: QText.body.copyWith(fontSize: 13.5),
                ),
                const SizedBox(height: 2),
                Text(
                  transaction.descriptionAr,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  _relativeDate(transaction.createdAt),
                  style: QText.tiny.copyWith(fontSize: 10.5, color: QColors.faint),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // المبلغ بإشارته الجاية من السيرفر — مابنستنتجش الإشارة من النوع.
              QLtr(
                child: Text(
                  transaction.signedAmount,
                  style: QText.num(size: 15, color: transaction.color),
                ),
              ),
              const SizedBox(height: 3),
              QLtr(
                child: Text(
                  fmt.money(transaction.balanceAfter),
                  style: QText.num(size: 11, weight: FontWeight.w700, color: QColors.faint),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// «من ٥ دقايق» / «من ٣ أيام» / «١٢/٣/٢٠٢٥» — نص نسبي مختصر.
String _relativeDate(DateTime? value) {
  if (value == null) return '—';

  final diff = DateTime.now().difference(value);
  if (diff.inMinutes < 1) return 'دلوقتي';
  if (diff.inMinutes < 60) return 'من ${diff.inMinutes} دقيقة';
  if (diff.inHours < 24) return 'من ${diff.inHours} ساعة';
  if (diff.inDays < 30) return 'من ${diff.inDays} يوم';
  return fmt.ltr('${value.day}/${value.month}/${value.year}');
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
