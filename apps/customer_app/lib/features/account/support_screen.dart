// شاشة ٣٠: الدعم والمساعدة — تذاكري (من /support) + فتح تذكرة جديدة + الأسئلة الشائعة.
// كارت الطلب الحالي والمحادثة المباشرة زي ما هما.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../models/support_ticket.dart';
import '../../providers/orders_provider.dart';
import '../../providers/support_provider.dart';
import '../../widgets/common.dart';

/// الأسئلة الشائعة — قائمة ثابتة (مافيش endpoint لها).
const _faqs = <String>[
  'وين طلبي؟ التتبع ما يتحدث',
  'وصلني طلب ناقص أو خاطئ',
  'كيف أسترجع مبلغ مدفوع؟',
  'كيف أستخدم الكوبونات؟',
  'تعديل أو إلغاء طلب',
];

class SupportScreen extends ConsumerWidget {
  const SupportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeOrder = ref.watch(activeOrderProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'الدعم والمساعدة'),
      body: ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: [
          const _LiveChatCard(),
          const SizedBox(height: 14),
          if (activeOrder != null) ...[
            _ActiveOrderCard(order: activeOrder),
            const SizedBox(height: 14),
          ],

          // ── تذاكري ──
          const _SectionTitle('تذاكري'),
          const SizedBox(height: 14),
          const _MyTicketsSection(),
          const SizedBox(height: 12),
          QButton(
            style: QButtonStyle.dark,
            label: 'فتح تذكرة جديدة',
            leading: const Text('🎫', style: TextStyle(fontSize: 16)),
            onPressed: () => context.push(QRoutes.raiseTicket),
          ),
          const SizedBox(height: 22),

          // ── الأسئلة الشائعة ──
          const _SectionTitle('الأسئلة الشائعة'),
          const SizedBox(height: 14),
          QTileGroup(
            children: [
              for (final faq in _faqs)
                QListTile(title: faq, onTap: () => _snack(context, 'قريباً')),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: QButton(
                  style: QButtonStyle.outline,
                  label: '📞 اتصل بنا',
                  onPressed: () => _snack(context, 'قريباً'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: QButton(
                  style: QButtonStyle.outline,
                  label: '✉️ راسلنا',
                  onPressed: () => _snack(context, 'قريباً'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// عنوان قسم داخل الشاشة.
class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        fontFamily: 'Cairo',
        fontSize: 14.5,
        fontWeight: FontWeight.w800,
        color: QColors.ink,
      ),
    );
  }
}

/// قائمة تذاكر العميل (GET /support/tickets/mine).
class _MyTicketsSection extends ConsumerWidget {
  const _MyTicketsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tickets = ref.watch(myTicketsProvider);

    return tickets.when(
      loading: () => Padding(
        padding: const EdgeInsets.symmetric(vertical: 18),
        child: Center(child: CircularProgressIndicator(color: QColors.brand)),
      ),
      error: (e, _) => _InlineError(
        message: e is ApiException ? e.message : 'تعذّر تحميل التذاكر',
        onRetry: () => ref.invalidate(myTicketsProvider),
      ),
      data: (list) {
        if (list.isEmpty) {
          return const QEmpty(message: 'لا توجد تذاكر — افتح تذكرة إن احتجت مساعدة', emoji: '🎫');
        }
        return QTileGroup(
          children: [for (final ticket in list) _TicketTile(ticket: ticket)],
        );
      },
    );
  }
}

/// صف تذكرة: الموضوع + رقم التذكرة وآخر نشاط + بادچ الحالة.
class _TicketTile extends StatelessWidget {
  const _TicketTile({required this.ticket});

  final SupportTicket ticket;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.push(QRoutes.ticket(ticket.id)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    ticket.subject,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: QColors.ink,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text.rich(
                    TextSpan(
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: QColors.textMuted,
                      ),
                      children: [
                        TextSpan(
                          text: ltr(ticket.number),
                          style: QText.num(
                            size: 11.5,
                            weight: FontWeight.w700,
                            color: QColors.textMuted,
                          ),
                        ),
                        TextSpan(text: ' · ${ticket.lastActivityLabel}'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            TicketStatusPill(status: ticket.status),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right, size: 20, color: QColors.hint),
          ],
        ),
      ),
    );
  }
}

/// بادچ حالة التذكرة — بلون الحالة على خلفية فاتحة منها. مشترك مع شاشة التفاصيل.
class TicketStatusPill extends StatelessWidget {
  const TicketStatusPill({super.key, required this.status});

  final TicketStatus status;

  @override
  Widget build(BuildContext context) {
    final color = status.color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(QRadius.pill),
      ),
      child: Text(
        status.label,
        style: TextStyle(
          fontFamily: 'Cairo',
          fontSize: 11.5,
          fontWeight: FontWeight.w800,
          color: color,
        ),
      ),
    );
  }
}

/// خطأ صغير داخل القسم + إعادة محاولة.
class _InlineError extends StatelessWidget {
  const _InlineError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return QCard(
      onTap: onRetry,
      child: Row(
        children: [
          Expanded(
            child: Text(message, style: QText.bodyMuted),
          ),
          const SizedBox(width: 8),
          Text(
            'إعادة المحاولة',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: QColors.gold,
            ),
          ),
        ],
      ),
    );
  }
}

/// كارت المحادثة المباشرة (أسود).
class _LiveChatCard extends StatelessWidget {
  const _LiveChatCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: QColors.inkSurface,
        borderRadius: BorderRadius.circular(QRadius.xl),
      ),
      child: Row(
        children: [
          Container(
            width: 50,
            height: 50,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: QColors.brand, shape: BoxShape.circle),
            child: const Text('💬', style: TextStyle(fontSize: 22)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'تحدث معنا مباشرة',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 15.5,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 3),
                Text.rich(
                  TextSpan(
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: QColors.darkSub,
                    ),
                    children: const [
                      TextSpan(text: 'فريق الدعم متاح '),
                      TextSpan(
                        text: '24/7',
                        style: TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.w700),
                      ),
                      TextSpan(text: ' — متوسط الرد دقيقة'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Material(
            color: QColors.brand,
            borderRadius: BorderRadius.circular(11),
            child: InkWell(
              onTap: () => _snack(context, 'قريباً'),
              borderRadius: BorderRadius.circular(11),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: Text(
                  'ابدأ',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: QColors.ink,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// «مشكلة في طلبك الحالي؟» — يظهر فقط لو في طلب شغّال.
class _ActiveOrderCard extends StatelessWidget {
  const _ActiveOrderCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: QColors.tint,
      borderRadius: BorderRadius.circular(QRadius.lg),
      child: InkWell(
        onTap: () => context.push(QRoutes.track(order.id)),
        borderRadius: BorderRadius.circular(QRadius.lg),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: QColors.brand,
                  borderRadius: BorderRadius.circular(13),
                ),
                child: const Text('🛵', style: TextStyle(fontSize: 18)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'مشكلة في طلبك الحالي؟',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 13.5,
                        fontWeight: FontWeight.w800,
                        color: QColors.ink,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text.rich(
                      TextSpan(
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: QColors.goldDeep,
                        ),
                        children: [
                          TextSpan(text: '${order.restaurantName} — '),
                          TextSpan(
                            text: ltr(order.number),
                            style: QText.num(
                              size: 12,
                              weight: FontWeight.w700,
                              color: QColors.goldDeep,
                            ),
                          ),
                          // الحالة الحقيقية بدل نص ثابت.
                          TextSpan(text: ' — ${order.status.ar}'),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right, size: 20, color: QColors.gold),
            ],
          ),
        ),
      ),
    );
  }
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message, style: QText.body.copyWith(color: QColors.brand)),
        behavior: SnackBarBehavior.floating,
        backgroundColor: QColors.inkSurface,
        duration: const Duration(seconds: 2),
      ),
    );
}
