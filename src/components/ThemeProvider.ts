import { Children, Component, PropTypes } from 'react'
import themrShape from '../utils/themr-shape'

export type TReactCSSThemrTheme = {
  [key: string]: string | TReactCSSThemrTheme
}

export interface ThemeProviderProps {
  innerRef?: Function,
  theme: TReactCSSThemrTheme
}

export default class ThemeProvider extends Component<ThemeProviderProps, never> {
  static propTypes = {
    children: PropTypes.element.isRequired,
    theme: PropTypes.object.isRequired
  }

  static defaultProps = {
    theme: {}
  }

  static childContextTypes = {
    themr: themrShape.isRequired
  }

  getChildContext() {
    return {
      themr: {
        theme: this.props.theme
      }
    }
  }

  render() {
    return Children.only(this.props.children)
  }
}
