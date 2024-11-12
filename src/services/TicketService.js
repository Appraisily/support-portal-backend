// ... código anterior sin cambios hasta la línea ~270

      // Log all dates for debugging
      logger.info('Ticket dates being sent to frontend:', {
        ticketId: ticket.id,
        ticketDates: {
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
          lastMessageAt: ticket.lastMessageAt
        },
        messageDates: formattedMessages.map(msg => ({
          messageId: msg.id,
          createdAt: msg.createdAt
        })),
        customerDates: customerInfo?.sales?.map(sale => ({
          type: 'sale',
          date: sale.date,
          rawDate: sale.date // Para ver el formato original
        }))
        .concat(customerInfo?.pendingAppraisals?.map(appraisal => ({
          type: 'pending_appraisal',
          date: appraisal.date,
          rawDate: appraisal.date
        })))
        .concat(customerInfo?.completedAppraisals?.map(appraisal => ({
          type: 'completed_appraisal',
          date: appraisal.date,
          rawDate: appraisal.date
        })))
      });

      return {
        success: true,
        data: {
          id: ticket.id,
          subject: ticket.subject,
          status: REVERSE_STATUS_MAPPING[ticket.status] || ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          customer: ticket.customer ? {
            id: ticket.customer.id,
            name: ticket.customer.name,
            email: ticket.customer.email
          } : null,
          messages: formattedMessages,
          customerInfo,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
          lastMessageAt: ticket.lastMessageAt,
          gmailThreadId: ticket.gmailThreadId
        }
      };

// ... resto del código sin cambios