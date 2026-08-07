# Gestão de vouchers

## Vínculo com mesa

- O voucher pode ser criado sem mesa ou vinculado a uma mesa ativa do evento.
- A seleção automática do checkout mostra apenas vouchers vinculados à mesa em operação.
- Vouchers sem mesa ou vinculados a outra mesa continuam utilizáveis mediante digitação manual do código.
- O uso manual não altera o vínculo permanente cadastrado no voucher.
- Um voucher não pode permanecer associado simultaneamente a duas comandas abertas.

## Edição

- Identificação, código e mesa vinculada podem ser corrigidos.
- O valor de um voucher não pode ser reduzido por edição.
- A edição financeira aceita somente um acréscimo não negativo.
- O acréscimo aumenta o valor total e o saldo disponível na mesma quantia.
- Toda alteração registra estado anterior e posterior na auditoria.

## Exclusão

- A exclusão é lógica e preserva o histórico.
- Antes da confirmação, o sistema calcula quantidade e valor das vendas pagas relacionadas.
- Ao confirmar, todas as vendas pagas que consumiram o voucher são estornadas.
- Estoque, pagamentos e saldo do voucher são recompostos pelas regras transacionais existentes.
- O voucher é cancelado, desvinculado da mesa e removido das telas operacionais.

## Validações obrigatórias

- migração de bancos existentes sem perda de dados;
- bloqueio de redução do saldo por edição;
- aplicação manual em mesa diferente da mesa cadastrada;
- restrição da lista automática à mesa atual;
- exclusão com estorno integral de venda, estoque e voucher;
- ausência da tela intermediária de permissões durante a troca de abas.
