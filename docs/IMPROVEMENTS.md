# Implementação das recomendações da avaliação

| Achado | Correção e evidência |
| --- | --- |
| Preço alterava o avanço real | Pesos fixos e datas/calendário capturados na baseline. Teste de reajuste sem avanço físico e comparação previsto/real. |
| Bases diferentes no físico previsto e real | Mesma ponderação nos dois indicadores; aprovação explícita administrativa. |
| Item parcial vencido não atrasava | Estado combina execução e atraso, com contagem de dias. |
| Falta de realizado financeiro | Lançamentos por serviço, pago/a pagar/vencido, data efetiva e curva cumulativa de pagamentos. |
| Reserva confundida com fluxo | Aviso explícito e indicadores separados; não se presume desembolso da reserva. |
| Centavos não conciliavam | Política decimal half-up por linha e totais inteiros em centavos. |
| Fim de semana com duração zero e custo fictício | Calendário com feriados; períodos novos sem dia útil rejeitados, legados sinalizados. |
| Dependências só textuais | Vínculos estruturados, validação de DAG, replanejamento confirmado e análise da rede cadastrada. |
| Rascunhos perdidos em foco/refresh | Dirty tracking, bloqueio de refresh destrutivo e confirmação manual; regressão com Área999 e atualização remota. |
| Conflito apagava campos | Formulário permanece aberto; retorno409 não sobrescreve a alteração de outra pessoa. |
| Logins corretos consumiam limite de falhas | Contadores de falhas separados de limite de volume; 35 logins corretos testados. |
| Leitor não via detalhes do Gantt | Diálogo de consulta, sem campos ou submit editáveis. |
| Texto/touch pequenos | Fontes ampliadas, códigos/semanas10px, apoio11px, controles44–48px e alvos de barras ampliados. |
| Diálogos sem nome acessível | aria-labelledby no editor, despesas e administração; foco e skip link. |
| PWA incompleta | SVG/PNG192/512 e Apple Touch180; cache limitado à própria aplicação. |
| Código de cálculo acoplado à interface | domain.js puro com testes Node para dinheiro, migração, avanço, calendário, rede e despesas. |
| Ausência de CI | Workflow executa testes de domínio, API, migração, interface móvel, compartilhamento e rascunhos. |
| Sem recuperação administrativa | CLI com getpass, invalidação de sessões e auditoria; sem PIN em argumentos. |
| Sem backup consistente automatizado | Snapshot inicial/diário, retenção7, integridade, estado de saúde e CLI de restauração com rollback. |
| Dados de origem incertos | Alerta de baixa confiança, valores zero e aprovação pendente; nenhum preço fabricado. |

## Dependências externas que continuam explícitas

- O GitHub Pages continua em modo local. Banco compartilhado exige ativar a hospedagem e definir o administrador de forma segura.
- O PIN de cinco números foi mantido conforme a preferência do produto. Ele tem entropia limitada; MFA ou provedor de identidade mais forte exigem nova decisão/configuração.
- Backup no mesmo volume não substitui armazenamento externo; a conta e o agendamento externo devem ser configurados pelo responsável.
- A obra precisa de cotações, projetos e medições validados por profissionais. O software não pode validar automaticamente um quantitativo que não recebeu.
- A rede de dependências original estava vazia. Os vínculos reais devem ser cadastrados antes de interpretar a análise como cronograma executivo aprovado.
- Testes em Safari real/VoiceOver e validação do proxy/HTTPS da hospedagem precisam ocorrer no ambiente correspondente.
