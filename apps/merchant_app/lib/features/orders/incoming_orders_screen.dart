// شاشة ٢ ⭐: الطلبات الواردة — قلب التطبيق. كروت لحظية + صوت تنبيه متكرر
// + عداد زمني لكل طلب + قبول/رفض.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/sound_service.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/branch_status_provider.dart';
import '../../providers/orders_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/order_card.dart';
import 'reject_order_sheet.dart';

class IncomingOrdersScreen extends ConsumerStatefulWidget {
  const IncomingOrdersScreen({super.key});

  @override
  ConsumerState<IncomingOrdersScreen> createState() => _IncomingOrdersScreenState();
}

class _IncomingOrdersScreenState extends ConsumerState<IncomingOrdersScreen> {
  /// بنمسك الخدمة من بدري عشان نقدر نوقّف الجرس في dispose من غير ما نلمس ref.
  late final AlertSoundService _sound = ref.read(alertSoundProvider);

  @override
  void initState() {
    super.initState();
    // لو رجعنا للشاشة والقائمة متخزّنة أصلاً، `ref.listen` مش هيتنده —
    // فبنزامن الصوت مرة بعد أول فريم كمان.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _syncSound(ref.read(incomingOrdersProvider).value?.length ?? 0);
    });
  }

  @override
  void dispose() {
    // الشاشة قفلت — ماينفعش الجرس يفضل يرن في الخلفية.
    _sound.stop();
    super.dispose();
  }

  /// بيشغّل/بيوقّف صوت التنبيه حسب لو فيه طلبات مستنية رد.
  void _syncSound(int count) {
    if (count > 0) {
      _sound.startRepeating();
    } else {
      _sound.stop();
    }
  }

  Future<void> _accept(MerchantOrder order, int prepMinutes) async {
    try {
      await ref.read(incomingOrdersProvider.notifier).accept(order.id, prepMinutes);
      if (!mounted) return;
      _sound.stop();
      showQSnack(context, 'اتقبل الطلب — وقت التحضير $prepMinutes دقيقة');
    } on ApiException catch (e) {
      if (!mounted) return;
      showQSnack(context, e.message);
    } catch (_) {
      if (!mounted) return;
      showQSnack(context, 'حدث خطأ، حاول مرة أخرى');
    }
  }

  Future<void> _reject(MerchantOrder order) async {
    final done = await showRejectOrderSheet(context, ref, order);
    if (!mounted || !done) return;
    _sound.stop();
    showQSnack(context, 'اترفض الطلب واتبلّغ العميل');
  }

  @override
  Widget build(BuildContext context) {
    // نقطة الربط الوحيدة مع السوكيت — بتبطّل البروڤايدرز لما يوصل order:new.
    ref.watch(socketRefreshProvider);

    // الصوت مربوط بطول القائمة: أول ما تتملّى يرن، وأول ما تفضى يقف.
    ref.listen<AsyncValue<List<MerchantOrder>>>(incomingOrdersProvider, (_, next) {
      _syncSound(next.value?.length ?? 0);
    });

    // اسم الفرع وحالته الحقيقيين من الفرع الحالي — بنعرض placeholder لحد ما يوصل.
    final branch = ref.watch(branchProvider).valueOrNull;
    final branchNameParts = branch == null
        ? const <String>[]
        : [branch.restaurantNameAr, branch.nameAr].where((p) => p.isNotEmpty).toList();
    final branchTitle =
        branchNameParts.isEmpty ? 'جارِ التحميل…' : branchNameParts.join(' — ');

    final async = ref.watch(incomingOrdersProvider);
    final incoming = ref.watch(incomingCountProvider);
    final preparing = ref.watch(preparingCountProvider);
    final ready = ref.watch(readyCountProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QDarkHeader(
        height: 172,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: QColors.brand,
                    borderRadius: BorderRadius.circular(QRadius.sm),
                  ),
                  child: const Text('🍔', style: TextStyle(fontSize: 20)),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        branchTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 15,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        branch == null ? '● …' : '● ${branch.status.ar}',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                          color: branch?.status.color ?? QColors.success,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                _AlertBadge(count: incoming),
              ],
            ),
            const SizedBox(height: 14),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  QChip(label: 'وارد', count: incoming, selected: true, onDark: true),
                  const SizedBox(width: 8),
                  QChip(
                    label: 'جاري التحضير',
                    count: preparing,
                    onDark: true,
                    onTap: () => context.go(QRoutes.active),
                  ),
                  const SizedBox(width: 8),
                  QChip(
                    label: 'جاهز',
                    count: ready,
                    onDark: true,
                    onTap: () => context.go(QRoutes.active),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: RefreshIndicator(
        color: QColors.ink,
        backgroundColor: QColors.brand,
        onRefresh: () => ref.read(incomingOrdersProvider.notifier).refresh(),
        child: async.when(
          loading: () => const QLoading(),
          error: (e, _) => QScrollableState(
            child: QErrorView(
              message: e is ApiException ? e.message : 'حدث خطأ',
              onRetry: () => ref.invalidate(incomingOrdersProvider),
            ),
          ),
          data: (orders) => orders.isEmpty
              ? const QScrollableState(
                  child: QEmpty(message: 'لا توجد طلبات جديدة الآن', emoji: '✅'),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(
                    QSpace.screenH,
                    QSpace.gapLg,
                    QSpace.screenH,
                    32,
                  ),
                  itemCount: orders.length,
                  separatorBuilder: (_, __) => const SizedBox(height: QSpace.gapLg),
                  itemBuilder: (_, i) {
                    final order = orders[i];
                    return QIncomingOrderCard(
                      key: ValueKey(order.id),
                      order: order,
                      onAccept: (prep) => _accept(order, prep),
                      onReject: () => _reject(order),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

/// شارة «🔊 تنبيه صوتي · 🔔 N» على يمين الهيدر الأسود.
class _AlertBadge extends StatelessWidget {
  const _AlertBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
      decoration: BoxDecoration(
        color: QColors.inkSoft,
        borderRadius: BorderRadius.circular(QRadius.sm),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '🔊 تنبيه صوتي · 🔔 ',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 11.5,
              fontWeight: FontWeight.w800,
              color: QColors.brand,
            ),
          ),
          QLtr(child: Text('$count', style: QText.num(size: 12, color: QColors.brand))),
        ],
      ),
    );
  }
}
