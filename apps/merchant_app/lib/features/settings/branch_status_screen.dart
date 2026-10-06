// شاشة ١١: فتح/إغلاق المطعم (Busy Mode) — شاشة داكنة بالكامل.
// قرص الحالة في النص، وتحته ثلاث بطاقات: مشغول / إيقاف مؤقت / إغلاق.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/format.dart' as fmt;
import '../../core/theme.dart';
import '../../models/branch.dart';
import '../../providers/branch_status_provider.dart';
import '../../widgets/common.dart';

/// أحمر فاتح يتقرا فوق الأسود — QColors.danger غامق زيادة على خلفية داكنة.
const _dangerOnDark = Color(0xFFFF7A7A);

/// حد بطاقة الإغلاق — أحمر مطفي فوق الأسود.
const _dangerBorderOnDark = Color(0xFF4A2525);

/// نص الفوتر الرمادي فوق الأسود.
const _footerOnDark = Color(0xFF6E6E6E);

/// الدرجة الفاتحة في تدرّج القرص وهو مفتوح.
const _dialLight = Color(0xFFFFE566);

/// دقايق «مشغول» المسموحة — السيرفر بيرفض أي رقم برّه ١٥–٣٠.
const _busyMinuteOptions = <int>[15, 20, 30];

/// مدد «الإيقاف المؤقت» بالدقايق.
const _pauseOptions = <int>[15, 30, 60];

class BranchStatusScreen extends ConsumerStatefulWidget {
  const BranchStatusScreen({super.key});

  @override
  ConsumerState<BranchStatusScreen> createState() => _BranchStatusScreenState();
}

class _BranchStatusScreenState extends ConsumerState<BranchStatusScreen> {
  /// نبضة كل ثانية عشان عدّاد «يفتح تلقائياً بعد …» يتحرّك.
  Timer? _ticker;

  /// الزر اللي مستني رد السيرفر دلوقتي — عشان نمنع ضغطتين ورا بعض.
  String? _pending;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && ref.read(pauseDeadlineProvider) != null) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QColors.inkSurface,
        content: Text(message, style: QText.body.copyWith(color: QColors.brand, fontSize: 14)),
      ),
    );
  }

  /// كل نداء شبكة بيعدّي من هنا: قفل الزر + رسالة الخطأ العربية من السيرفر.
  Future<void> _run(String action, Future<void> Function() call) async {
    if (_pending != null) return;
    setState(() => _pending = action);
    try {
      await call();
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _pending = null);
    }
  }

  Future<void> _confirmClose() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: QColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(QRadius.xl)),
        title: Text('إغلاق المطعم؟', style: QText.section),
        content: Text(
          'لن تستقبل أي طلبات جديدة حتى تفتح مرة أخرى أو يفتح الفرع حسب جدول الأوقات.',
          style: QText.bodyMuted,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text('رجوع', style: QText.body.copyWith(color: QColors.label)),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text('إغلاق', style: QText.body.copyWith(color: QColors.danger)),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;
    await _run('close', () => ref.read(branchProvider.notifier).setStatus(BranchStatus.closed));
  }

  @override
  Widget build(BuildContext context) {
    final branch = ref.watch(branchProvider);

    return Scaffold(
      backgroundColor: QColors.inkSurface,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: QBackButton(onDark: true),
            ),
            Expanded(
              child: branch.when(
                loading: () => const QLoading(),
                error: (error, _) => _DarkError(
                  message: error is ApiException ? error.message : 'تعذّر تحميل بيانات الفرع',
                  onRetry: () => ref.read(branchProvider.notifier).refresh(),
                ),
                data: _body,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(Branch branch) {
    final deadline = ref.watch(pauseDeadlineProvider);
    final lastChange = ref.watch(lastStatusChangeProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(28, 8, 28, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          Center(child: _StatusDial(status: branch.status)),
          const SizedBox(height: 22),
          Text(
            '${branch.restaurantNameAr} — ${branch.nameAr}',
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            _subtitle(branch),
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13.5,
              fontWeight: FontWeight.w600,
              color: QColors.darkSub,
            ),
          ),
          const SizedBox(height: 26),
          _busyCard(branch),
          const SizedBox(height: 12),
          _pauseCard(branch, deadline),
          const SizedBox(height: 12),
          _closeCard(branch),
          const SizedBox(height: 22),
          Center(
            child: Text(
              lastChange == null
                  ? 'آخر تغيير للحالة: —'
                  : 'آخر تغيير للحالة: ${fmt.ltr(_clock(lastChange))}',
              style: const TextStyle(
                fontFamily: 'Cairo',
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: _footerOnDark,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// «يستقبل الطلبات · يغلق 2:00 AM» — وقت الإغلاق من جدول النهارده لو موجود.
  String _subtitle(Branch branch) {
    if (!branch.status.isReceiving) return 'لا يستقبل طلبات';

    final today = DateTime.now().weekday % 7;
    WorkingHour? slot;
    for (final hour in branch.workingHours) {
      if (hour.weekday == today && !hour.isClosed) {
        slot = hour;
        break;
      }
    }

    if (slot == null) return 'يستقبل الطلبات';
    return 'يستقبل الطلبات · يغلق ${fmt.ltr(_to12h(slot.closesAt))}';
  }

  // ── بطاقة «مشغول» ──
  Widget _busyCard(Branch branch) {
    final isBusy = branch.status == BranchStatus.busy;

    return _DarkCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'مشغول Busy Mode',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'يضيف +15–30 دقيقة تلقائياً لوقت التحضير',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: QColors.darkSub,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              if (isBusy)
                _DarkOutlineButton(
                  label: 'إيقاف',
                  loading: _pending == 'busy-off',
                  onTap: () => _run(
                    'busy-off',
                    () => ref.read(branchProvider.notifier).setStatus(BranchStatus.open),
                  ),
                )
              else
                _BrandPill(
                  label: '⏸ تفعيل',
                  loading: _pending == 'busy-on',
                  onTap: () => _run(
                    'busy-on',
                    () => ref.read(branchProvider.notifier).setStatus(
                          BranchStatus.busy,
                          busyExtraMinutes: branch.busyExtraMinutes.clamp(15, 30),
                        ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Text(
                'الدقايق الإضافية',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: QColors.darkSub,
                ),
              ),
              const SizedBox(width: 10),
              // الشرائح شغّالة في وضع «مشغول» بس.
              for (final minutes in _busyMinuteOptions) ...[
                Opacity(
                  opacity: isBusy ? 1 : 0.4,
                  child: QChip(
                    label: '$minutes',
                    onDark: true,
                    selected: isBusy && branch.busyExtraMinutes == minutes,
                    onTap: !isBusy
                        ? null
                        : () => _run(
                              'busy-$minutes',
                              () => ref.read(branchProvider.notifier).setStatus(
                                    BranchStatus.busy,
                                    busyExtraMinutes: minutes,
                                  ),
                            ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ],
      ),
    );
  }

  // ── بطاقة «إيقاف مؤقت» ──
  Widget _pauseCard(Branch branch, DateTime? deadline) {
    final isPaused = branch.status == BranchStatus.paused;
    final remaining = deadline?.difference(DateTime.now());
    final showCountdown = isPaused && remaining != null && !remaining.isNegative;

    return _DarkCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'إيقاف مؤقت — ضغط مطبخ',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            showCountdown
                ? 'يفتح تلقائياً بعد ${fmt.ltr(_mmss(remaining))}'
                : isPaused
                    ? 'موقوف — افتح الفرع يدوياً لما تجهزوا'
                    : 'إيقاف استقبال الطلبات لمدة محددة',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: showCountdown ? QColors.brand : QColors.darkSub,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final minutes in _pauseOptions) ...[
                Expanded(
                  child: _DarkOutlineButton(
                    label: '$minutes دقيقة',
                    loading: _pending == 'pause-$minutes',
                    onTap: () => _run(
                      'pause-$minutes',
                      () => ref.read(branchProvider.notifier).pauseFor(Duration(minutes: minutes)),
                    ),
                  ),
                ),
                if (minutes != _pauseOptions.last) const SizedBox(width: 8),
              ],
            ],
          ),
          if (isPaused) ...[
            const SizedBox(height: 10),
            _BrandPill(
              label: 'افتح الآن',
              loading: _pending == 'resume',
              onTap: () => _run(
                'resume',
                () => ref.read(branchProvider.notifier).setStatus(BranchStatus.open),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ── بطاقة «إغلاق المطعم» ──
  Widget _closeCard(Branch branch) {
    final isClosed = branch.status == BranchStatus.closed;

    return _DarkCard(
      borderColor: _dangerBorderOnDark,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'إغلاق المطعم الآن',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: _dangerOnDark,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'يفتح تلقائياً حسب جدول الأوقات',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: QColors.darkSub,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          if (isClosed)
            _BrandPill(
              label: 'فتح المطعم',
              loading: _pending == 'open',
              onTap: () => _run(
                'open',
                () => ref.read(branchProvider.notifier).setStatus(BranchStatus.open),
              ),
            )
          else
            _DarkOutlineButton(
              label: 'إغلاق',
              color: _dangerOnDark,
              loading: _pending == 'close',
              onTap: _confirmClose,
            ),
        ],
      ),
    );
  }
}

// ─────────────────────────── قرص الحالة ───────────────────────────

class _StatusDial extends StatelessWidget {
  const _StatusDial({required this.status});

  final BranchStatus status;

  @override
  Widget build(BuildContext context) {
    final isOpen = status == BranchStatus.open;
    final isBusy = status == BranchStatus.busy;
    final isLit = isOpen || isBusy;

    return Container(
      width: 170,
      height: 170,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: isLit ? null : QColors.inkSoft,
        border: isLit ? null : Border.all(color: QColors.inkLine, width: 2),
        gradient: isLit
            ? RadialGradient(
                center: const Alignment(0, -0.2),
                colors: isOpen
                    ? [_dialLight, QColors.brand]
                    : [QColors.brand, QColors.goldDeep],
              )
            : null,
        boxShadow: isOpen
            ? [BoxShadow(color: QColors.brand.withValues(alpha: 0.35), blurRadius: 60)]
            : null,
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('🍔', style: TextStyle(fontSize: 34)),
          const SizedBox(height: 8),
          Text(
            status.ar,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 17,
              fontWeight: FontWeight.w900,
              color: isLit ? QColors.ink : Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────── عناصر صغيرة فوق الخلفية الداكنة ───────────────────────

class _DarkCard extends StatelessWidget {
  const _DarkCard({required this.child, this.borderColor});

  final Widget child;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 18),
      decoration: BoxDecoration(
        color: QColors.inkSoft,
        borderRadius: BorderRadius.circular(16),
        border: borderColor == null ? null : Border.all(color: borderColor!, width: 1.5),
      ),
      child: child,
    );
  }
}

/// زر أصفر صغير جوّه بطاقة داكنة.
class _BrandPill extends StatelessWidget {
  const _BrandPill({required this.label, this.onTap, this.loading = false});

  final String label;
  final VoidCallback? onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: QColors.brand,
      borderRadius: BorderRadius.circular(11),
      child: InkWell(
        onTap: loading ? null : onTap,
        borderRadius: BorderRadius.circular(11),
        child: Container(
          constraints: const BoxConstraints(minHeight: 40),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          alignment: Alignment.center,
          child: loading
              ? SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2.2, color: QColors.ink),
                )
              : Text(
                  label,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: QColors.ink,
                  ),
                ),
        ),
      ),
    );
  }
}

/// زر بحد فوق خلفية داكنة.
class _DarkOutlineButton extends StatelessWidget {
  const _DarkOutlineButton({
    required this.label,
    this.onTap,
    this.color,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onTap;
  final Color? color;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final fg = color ?? Colors.white;

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(11),
      child: InkWell(
        onTap: loading ? null : onTap,
        borderRadius: BorderRadius.circular(11),
        child: Container(
          constraints: const BoxConstraints(minHeight: 40),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(11),
            border: Border.all(color: color ?? QColors.inkLine, width: 1.5),
          ),
          child: loading
              ? SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2.2, color: fg),
                )
              : Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: fg,
                  ),
                ),
        ),
      ),
    );
  }
}

/// نسخة QErrorView للخلفية الداكنة.
class _DarkError extends StatelessWidget {
  const _DarkError({required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('😕', style: TextStyle(fontSize: 44)),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: QColors.darkSub,
              ),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              _BrandPill(label: 'إعادة المحاولة', onTap: onRetry),
            ],
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────── تنسيق الوقت ───────────────────────────

/// "23:30" → "11:30 PM" — بيرجّع النص زي ما هو لو مش بالشكل المتوقع.
String _to12h(String hhmm) {
  final parts = hhmm.split(':');
  if (parts.length < 2) return hhmm;
  final hour = int.tryParse(parts[0]);
  if (hour == null) return hhmm;
  final period = hour < 12 ? 'AM' : 'PM';
  final display = hour % 12 == 0 ? 12 : hour % 12;
  return '$display:${parts[1]} $period';
}

String _two(int value) => value.toString().padLeft(2, '0');

String _clock(DateTime time) => '${_two(time.hour)}:${_two(time.minute)}';

String _mmss(Duration duration) {
  final total = duration.inSeconds;
  return '${_two(total ~/ 60)}:${_two(total % 60)}';
}
